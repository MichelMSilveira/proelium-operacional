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
  constructor({ dataFile, usersFile, companiesFile, routinesFile }) {
    this.dataFile = dataFile;
    this.usersFile = usersFile;
    this.companiesFile = companiesFile;
    this.routinesFile = routinesFile;
    this.backend = 'json';
  }

  async initialize() {}

  async readSharedData() {
    if (!fs.existsSync(this.dataFile)) return { ...EMPTY_STATE };
    return normalizeState(JSON.parse(fs.readFileSync(this.dataFile, 'utf8')));
  }

  async writeSharedData(data, baseRevision) {
    const current = await this.readSharedData();
    if (current.revision !== baseRevision) return { conflict: true, current };
    const value = { data, updatedAt: new Date().toISOString(), revision: current.revision + 1 };
    atomicWriteJson(this.dataFile, value);
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

  async close() {}
}

class PostgresStorage {
  constructor({ connectionString, dataFile, usersFile, companiesFile, routinesFile, mirrorJson }) {
    const { Pool } = require('pg');
    this.pool = new Pool({ connectionString, max: Number(process.env.PGPOOL_MAX || 10), connectionTimeoutMillis: 5000 });
    this.dataFile = dataFile;
    this.usersFile = usersFile;
    this.mirrorJson = mirrorJson;
    this.backend = 'postgresql';
  }

  async initialize() {
    await this.pool.query('select 1');
  }

  async readSharedData() {
    const result = await this.pool.query("select data, updated_at, revision from app_state where state_key = 'shared'");
    if (!result.rowCount) return { ...EMPTY_STATE };
    return normalizeState(result.rows[0]);
  }

  async writeSharedData(data, baseRevision, actor = 'unknown') {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      // Serializes writes even before the singleton row exists, so two clients
      // cannot both accept base revision zero during a fresh installation.
      await client.query("select pg_advisory_xact_lock(hashtext('proelium:app_state:shared'))");
      const result = await client.query("select data, updated_at, revision from app_state where state_key = 'shared' for update");
      const current = result.rowCount ? normalizeState(result.rows[0]) : { ...EMPTY_STATE };
      if (current.revision !== baseRevision) {
        await client.query('rollback');
        return { conflict: true, current };
      }
      const value = { data, updatedAt: new Date().toISOString(), revision: current.revision + 1 };
      await client.query(
        `insert into app_state (state_key, data, revision, updated_at)
         values ('shared', $1::jsonb, $2, $3)
         on conflict (state_key) do update set data = excluded.data, revision = excluded.revision, updated_at = excluded.updated_at`,
        [JSON.stringify(data), value.revision, value.updatedAt]
      );
      await client.query(
        `insert into app_state_revisions (state_key, revision, data, updated_at, actor)
         values ('shared', $1, $2::jsonb, $3, $4)`,
        [value.revision, JSON.stringify(data), value.updatedAt, actor]
      );
      await client.query('commit');
      if (this.mirrorJson) {
        try { atomicWriteJson(this.dataFile, value); }
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

  async readCompanies() { return (await this.pool.query('select id, name, document, responsible, phone, status, created_at as "createdAt" from companies order by name')).rows; }
  async writeCompanies(companies) { for (const company of companies) await this.pool.query(`insert into companies (id,name,document,responsible,phone,status) values ($1,$2,$3,$4,$5,$6) on conflict (id) do update set name=excluded.name, document=excluded.document, responsible=excluded.responsible, phone=excluded.phone, status=excluded.status`, [company.id,company.name,company.document||'',company.responsible||'',company.phone||'',company.status||'pending']); }
  async readRoutines(companyId) { return (await this.pool.query('select id, name, description, periodicity, steps, created_at as "createdAt", updated_at as "updatedAt" from routines where company_id=$1 order by created_at desc',[companyId])).rows.map(row=>({...row,steps:row.steps||[]})); }
  async writeRoutines(companyId, routines) { const client=await this.pool.connect(); try { await client.query('begin'); await client.query('delete from routines where company_id=$1',[companyId]); for(const routine of routines) await client.query('insert into routines (id,company_id,name,description,periodicity,steps) values ($1,$2,$3,$4,$5,$6::jsonb)',[routine.id,companyId,routine.name,routine.description||'',routine.periodicity||'Sem periodicidade',JSON.stringify(routine.steps||[])]); await client.query('commit'); } catch(error){await client.query('rollback');throw error} finally {client.release()} }

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
