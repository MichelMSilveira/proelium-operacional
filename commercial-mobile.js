// Compacta os cartões comerciais sem alterar dados nem regras do fluxo principal.
(()=>{
  const compactLabel=button=>{
    if(!button||button.dataset.mobileLabelReady)return;
    const full=button.textContent.trim(),short=button.matches('[data-qualify-opportunity]')?'Qualificar →':button.matches('[data-start-survey-opportunity]')?'Iniciar levantamento':button.matches('[data-open-commercial-survey]')?'Continuar levantamento':button.matches('[data-survey-start-quote]')?'Criar orçamento →':button.matches('[data-open-commercial-quote]')?'Ver orçamento':'Abrir cliente';
    button.textContent='';
    const desktop=document.createElement('span'),mobile=document.createElement('span');
    desktop.className='commercial-action-full';desktop.textContent=full;
    mobile.className='commercial-action-compact';mobile.textContent=short;
    button.append(desktop,mobile);button.dataset.mobileLabelReady='true';
  };
  const enhance=()=>document.querySelectorAll('.commercial-deal').forEach(card=>{
    const actions=card.querySelector('.deal-actions'),remove=card.querySelector('[data-delete-opportunity]');
    if(!actions||!remove)return;
    compactLabel(actions.querySelector('.button.primary'));
    const paragraphs=[...card.children].filter(element=>element.tagName==='P');
    paragraphs[paragraphs.length-1]?.classList.add('commercial-next-action');
    if(!card.querySelector('.commercial-mobile-details')){
      const details=document.createElement('details');details.className='commercial-mobile-details';
      const summary=document.createElement('summary');summary.textContent='Detalhes';
      const content=document.createElement('div'),contact=card.querySelector('.commercial-contact-details'),value=card.querySelector('.deal-value'),orientation=card.querySelector('.commercial-next-step');
      [contact,value,orientation].forEach(element=>{if(element){const row=document.createElement(element===orientation?'small':'span');row.textContent=element.textContent;content.append(row)}});
      details.append(summary,content);actions.before(details);
    }
    if(!remove.closest('.commercial-actions-menu')){
      const menu=document.createElement('details');menu.className='commercial-actions-menu';
      const summary=document.createElement('summary');summary.textContent='⋮';summary.setAttribute('aria-label','Mais ações');summary.title='Mais ações';
      remove.textContent='Excluir oportunidade';remove.before(menu);menu.append(summary,remove);
    }
  });
  new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true});
  enhance();
})();
