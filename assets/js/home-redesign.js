(function(){
  var reduce=false;
  try{reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;}catch(e){}

  var els=[].slice.call(document.querySelectorAll('.hv2-reveal'));
  if(reduce||!('IntersectionObserver' in window)){
    els.forEach(function(el){el.classList.add('in');});
  }else{
    var io=new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){entry.target.classList.add('in');io.unobserve(entry.target);}
      });
    },{rootMargin:'0px 0px -8% 0px'});
    els.forEach(function(el){io.observe(el);});
  }

  var form=document.getElementById('hv2-scan-form');
  if(!form)return;
  var domain=document.getElementById('hv2-domain');
  var email=document.getElementById('hv2-email');
  var status=document.getElementById('hv2-status');
  var result=document.getElementById('hv2-result');
  var score=document.getElementById('hv2-score');
  var button=form.querySelector('button');
  var original=button.textContent;

  form.addEventListener('submit',function(event){
    event.preventDefault();
    var d=(domain.value||'').trim();
    var em=(email.value||'').trim();
    if(d.indexOf('.')<0){status.textContent='Enter a website such as yourbusiness.com.';domain.focus();return;}
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){status.textContent='Enter a valid email address.';email.focus();return;}
    status.textContent='Scanning…';
    result.classList.remove('show');
    button.disabled=true;
    button.textContent='Scanning…';
    fetch('/api/scan-live',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({domain:d,email:em})
    }).then(function(response){
      return response.json().then(function(json){return {ok:response.ok,json:json};});
    }).then(function(payload){
      if(!payload.ok||!payload.json||!payload.json.ok){throw new Error((payload.json&&payload.json.error)||'Scan failed');}
      status.textContent='Your full report is on its way to '+em+'.';
      score.textContent=(payload.json.overall||0)+'/100';
      result.classList.add('show');
    }).catch(function(error){
      status.textContent=error.message||'Something went wrong. Try again.';
    }).finally(function(){
      button.disabled=false;
      button.textContent=original;
    });
  });
})();
