const fs = require('fs');
const path = require('path');

const EMPTY_STATE = Object.freeze({ data: null, updatedAt: null, revision: 0 });

function normalizeState(value) {
  if (!value || typeof value !== 'object') return { ...EMPTY_STATE };
  return {
    data: value.data && typeof value.data === 'object' ? value.data : null,
    updatedAt: value.updatedAt || value.updated_at || null,
    revision: Number(value.revision || 0)
  };
}

function atomicWriteJson(file, value, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { encoding: 'utf8', ...(mode ? { mode } : {}) });
  fs.renameSync(temporary, file);
}

class JsonStorage {
  constructor({ dataFile, usersFile, companiesFile, routinesFile, invitesFile, companyDataDirectory }) {
    this.dataFile = dataFile;
    this.usersFile = usersFile;
    this.companiesFile = companiesFile;
    this.routinesFile = routinesFile;
    this.invitesFile = invitesFile;
    this.companyDataDirectory = companyDataDirectory || path.join(path.dirname(dataFile), 'company-data');
    this.backend = 'json';
  }

  async initialize() {}

  stateFile(companyId='legacy') {
    if (!companyId || companyId==='legacy') return this.dataFile;
    const safeId=String(companyId).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,100);
    return path.join(this.companyDataDirectory, `${safeId}.json`);
  }

  async readSharedData(companyId='legacy') {
    const file=this.stateFile(companyId);
    if (!fs.existsSync(file)) return { ...EMPTY_STATE };
    return normalizeState(JSON.parse(fs.readFileSync(file, 'utf8')));
  }

  async writeSharedData(data, baseRevision, actor='unknown', companyId='legacy') {
    const file=this.stateFile(companyId), current = await this.readSharedData(companyId);
    if (current.revision !== baseRevision) return { conflict: true, current };
    const value = { data, updatedAt: new Date().toISOString(), revision: current.revision + 1 };
    atomicWriteJson(file, value);
    return { conflict: false, value };
  }

  async readUsers() {
    if (!fs.existsSync(this.usersFile)) return [];
    try {
      const users = JSON.parse(fs.readFileSync(this.usersFile, 'utf8'));
      return Array.isArray(users) ? users : [];
    } catch { return []; }
  }

  async writeUsers(users) {
    atomicWriteJson(this.usersFile, users, 0o600);
  }

  async readCompanies() { try { return JSON.parse(fs.readFileSync(this.companiesFile, 'utf8')); } catch { return []; } }
  async writeCompanies(companies) { atomicWriteJson(this.companiesFile, companies, 0o600); }
  async readRoutines(companyId) { try { const all=JSON.parse(fs.readFileSync(this.routinesFile, 'utf8')); return Array.isArray(all[companyId])?all[companyId]:[]; } catch { return []; } }
  async writeRoutines(companyId, routines) { let all={}; try { all=JSON.parse(fs.readFileSync(this.routinesFile, 'utf8')); } catch {} all[companyId]=routines; atomicWriteJson(this.routinesFile, all, 0o600); }
  async readInvites() { try { const invites=JSON.parse(fs.readFileSync(this.invitesFile,'utf8')); return Array.isArray(invites)?invites:[]; } catch { return []; } }
  async writeInvites(invites) { atomicWriteJson(this.invitesFile, invites, 0o600); }
  async deleteCompany(companyId) {
    if (!companyId || companyId === 'legacy') throw new Error('Empresa inválida para exclusão.');
    await this.writeCompanies((await this.readCompanies()).filter(company => company.id !== companyId));
    await this.writeUsers((await this.readUsers()).filter(user => user.companyId !== companyId));
    await this.writeInvites((await this.readInvites()).filter(invite => invite.companyId !== companyId));
    let routines = {};
    try { routines = JSON.parse(fs.readFileSync(this.routinesFile, 'utf8')); } catch {}
    if (Object.prototype.hasOwnProperty.call(routines, companyId)) { delete routines[companyId]; atomicWriteJson(this.routinesFile, routines, 0o600); }
    const file = this.stateFile(companyId);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return true;
  }

  async close() {}
}

class PostgresStorage {
  constructor({ connectionString, dataFile, usersFile, companiesFile, routinesFile, invitesFile, companyDataDirectory, mirrorJson }) {
    const { Pool } = require('pg');
    this.pool = new Pool({ connectionString, max: Number(process.env.PGPOOL_MAX || 10), connectionTimeoutMillis: 5000 });
    this.dataFile = dataFile;
    this.usersFile = usersFile;
    this.mirrorJson = mirrorJson;
    this.invitesFile = invitesFile;
    this.companyDataDirectory = companyDataDirectory || path.join(path.dirname(dataFile), 'company-data');
    this.backend = 'postgresql';
  }

  async initialize() {
    await this.pool.query('select 1');
  }

  stateKey(companyId='legacy') { return !companyId || companyId==='legacy' ? 'shared' : `company:${String(companyId).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,100)}`; }

  async readSharedData(companyId='legacy') {
    const stateKey=this.stateKey(companyId), result = await this.pool.query('select data, updated_at, revision from app_state where state_key = $1',[stateKey]);
    if (!result.rowCount) return { ...EMPTY_STATE };
    return normalizeState(result.rows[0]);
  }

  async writeSharedData(data, baseRevision, actor = 'unknown', companyId='legacy') {
    const stateKey=this.stateKey(companyId);
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      // Serializes writes even before the singleton row exists, so two clients
      // cannot both accept base revision zero during a fresh installation.
      await client.query('select pg_advisory_xact_lock(hashtext($1))',['proelium:app_state:'+stateKey]);
      const result = await client.query('select data, updated_at, revision from app_state where state_key = $1 for update',[stateKey]);
      const current = result.rowCount ? normalizeState(result.rows[0]) : { ...EMPTY_STATE };
      if (current.revision !== baseRevision) {
        await client.query('rollback');
        return { conflict: true, current };
      }
      const value = { data, updatedAt: new Date().toISOString(), revision: current.revision + 1 };
      await client.query(
        `insert into app_state (state_key, data, revision, updated_at)
         values ($1, $2::jsonb, $3, $4)
         on conflict (state_key) do update set data = excluded.data, revision = excluded.revision, updated_at = excluded.updated_at`,
        [stateKey, JSON.stringify(data), value.revision, value.updatedAt]
      );
      await client.query(
        `insert into app_state_revisions (state_key, revision, data, updated_at, actor)
         values ($1, $2, $3::jsonb, $4, $5)`,
        [stateKey, value.revision, JSON.stringify(data), value.updatedAt, actor]
      );
      await client.query('commit');
      if (this.mirrorJson) {
        try { atomicWriteJson(companyId&&companyId!=='legacy'?path.join(this.companyDataDirectory, `${String(companyId).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,100)}.json`):this.dataFile, value); }
        catch (error) { console.error('Falha ao atualizar espelho JSON:', error.message); }
      }
      return { conflict: false, value };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async readUsers() {
    const result = await this.pool.query(
      `select username, name, role, active, email, company_id as "companyId", salt, password_hash as hash,
              created_at as "createdAt", updated_at as "updatedAt"
       from app_users order by username`
    );
    return result.rows;
  }

  async writeUsers(users) {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query('lock table app_users in share row exclusive mode');
      const usernames = [];
      for (const user of users) {
        usernames.push(user.username);
        await client.query(
          `insert into app_users (username, name, role, active, email, company_id, salt, password_hash, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9::timestamptz, now()), now())
           on conflict (username) do update set name = excluded.name, role = excluded.role,
             active = excluded.active, company_id = excluded.company_id, salt = excluded.salt, password_hash = excluded.password_hash, updated_at = now()`,
          [user.username, user.name || user.username, user.role || 'operador', user.active !== false, user.email || null, user.companyId || null, user.salt, user.hash, user.createdAt || null]
        );
      }
      if (usernames.length) await client.query('delete from app_users where not (username = any($1::text[]))', [usernames]);
      else await client.query('delete from app_users');
      await client.query('commit');
      if (this.mirrorJson) {
        try { atomicWriteJson(this.usersFile, users, 0o600); }
        catch (error) { console.error('Falha ao atualizar espelho de usuários:', error.message); }
      }
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async readCompanies() { return (await this.pool.query('select id, name, document, responsible, phone, company_type as "companyType", profile_info as "profileInfo", status, access_level as "accessLevel", license_status as "licenseStatus", modules, admin_notes as "adminNotes", reviewed_at as "reviewedAt", created_at as "createdAt" from companies order by name')).rows.map(row=>({...row,modules:row.modules||[]})); }
  async writeCompanies(companies) { for (const company of companies) await this.pool.query(`insert into companies (id,name,document,responsible,phone,company_type,profile_info,status,access_level,license_status,modules,admin_notes,reviewed_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13) on conflict (id) do update set name=excluded.name, document=excluded.document, responsible=excluded.responsible, phone=excluded.phone, company_type=excluded.company_type, profile_info=excluded.profile_info, status=excluded.status, access_level=excluded.access_level, license_status=excluded.license_status, modules=excluded.modules, admin_notes=excluded.admin_notes, reviewed_at=excluded.reviewed_at`, [company.id,company.name,company.document||'',company.responsible||'',company.phone||'',company.companyType||'contratante',company.profileInfo||'',company.status||'pending',company.accessLevel||'limited',company.licenseStatus||'pending',JSON.stringify(company.modules||['dashboard','knowledge']),company.adminNotes||'',company.reviewedAt||null]); }
  async readInvites() { return (await this.pool.query('select id, company_id as "companyId", token_hash as "tokenHash", email, role, modules, expires_at as "expiresAt", used_at as "usedAt", created_at as "createdAt" from company_invites order by created_at desc')).rows.map(row=>({...row,modules:row.modules||[]})); }
  async writeInvites(invites) { const client=await this.pool.connect(); try { await client.query('begin'); await client.query('delete from company_invites'); for(const invite of invites) await client.query('insert into company_invites (id,company_id,token_hash,email,role,modules,expires_at,used_at,created_at) values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)',[invite.id,invite.companyId,invite.tokenHash,invite.email||null,invite.role||'operacao',JSON.stringify(invite.modules||[]),invite.expiresAt,invite.usedAt||null,invite.createdAt||new Date().toISOString()]); await client.query('commit'); } catch(error){await client.query('rollback');throw error} finally {client.release()} }
  async readRoutines(companyId) { return (await this.pool.query('select id, name, description, periodicity, steps, created_at as "createdAt", updated_at as "updatedAt" from routines where company_id=$1 order by created_at desc',[companyId])).rows.map(row=>({...row,steps:row.steps||[]})); }
  async writeRoutines(companyId, routines) { const client=await this.pool.connect(); try { await client.query('begin'); await client.query('delete from routines where company_id=$1',[companyId]); for(const routine of routines) await client.query('insert into routines (id,company_id,name,description,periodicity,steps) values ($1,$2,$3,$4,$5,$6::jsonb)',[routine.id,companyId,routine.name,routine.description||'',routine.periodicity||'Sem periodicidade',JSON.stringify(routine.steps||[])]); await client.query('commit'); } catch(error){await client.query('rollback');throw error} finally {client.release()} }
  async deleteCompany(companyId) {
    if (!companyId || companyId === 'legacy') throw new Error('Empresa inválida para exclusão.');
    const stateKey = this.stateKey(companyId), client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query('delete from app_users where company_id=$1', [companyId]);
      await client.query('delete from app_state_revisions where state_key=$1', [stateKey]);
      await client.query('delete from app_state where state_key=$1', [stateKey]);
      const result = await client.query('delete from companies where id=$1 returning id', [companyId]);
      await client.query('commit');
      if (this.mirrorJson) {
        try { const file=path.join(this.companyDataDirectory, `${String(companyId).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,100)}.json`); if (fs.existsSync(file)) fs.unlinkSync(file); }
        catch (error) { console.error('Falha ao remover espelho JSON da empresa:', error.message); }
      }
      return result.rowCount > 0;
    } catch (error) { await client.query('rollback'); throw error; }
    finally { client.release(); }
  }

  async close() {
    await this.pool.end();
  }
}

function createStorage(options) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return new JsonStorage(options);
  return new PostgresStorage({
    ...options,
    connectionString,
    mirrorJson: process.env.PROELIUM_JSON_MIRROR !== 'false'
  });
}

module.exports = { createStorage, JsonStorage, PostgresStorage, normalizeState };
