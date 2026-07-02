(function(){
  // mobile nav
  var t=document.querySelector('.nav-toggle'), m=document.getElementById('mobile-nav');
  if(t&&m){t.addEventListener('click',function(){var open=t.getAttribute('aria-expanded')==='true';t.setAttribute('aria-expanded',String(!open));if(open){m.hidden=true;t.setAttribute('aria-label','Open menu')}else{m.hidden=false;t.setAttribute('aria-label','Close menu')}});}
  // accordion
  document.querySelectorAll('[data-accordion] .acc-q').forEach(function(q){
    q.addEventListener('click',function(){
      var open=q.getAttribute('aria-expanded')==='true';
      var a=q.nextElementSibling;
      q.setAttribute('aria-expanded',String(!open));
      a.style.maxHeight=open?null:(a.scrollHeight+'px');
    });
  });
  // reveal on scroll
  var rev=document.querySelectorAll('.reveal');
  if('IntersectionObserver' in window){
    var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{rootMargin:'0px 0px -8% 0px'});
    rev.forEach(function(el){io.observe(el);});
  }else{rev.forEach(function(el){el.classList.add('in');});}
  // form handling (client-side success; wire to a handler to receive submissions)
  function handle(id,redirect){
    var f=document.getElementById(id); if(!f) return;
    var err=f.querySelector('.form-error');
    f.addEventListener('submit',function(e){
      e.preventDefault(); var ok=true;
      f.querySelectorAll('[required]').forEach(function(inp){
        var bad=!inp.value.trim()||(inp.type==='email'&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(inp.value));
        inp.parentElement.classList.toggle('invalid',bad); if(bad) ok=false;
      });
      if(!ok){if(err){err.hidden=false;err.textContent='Please fill in the highlighted fields.';}return;}
      if(err) err.hidden=true;
      if(redirect){window.location.href=redirect;}
    });
    f.querySelectorAll('input,textarea').forEach(function(inp){inp.addEventListener('input',function(){inp.parentElement.classList.remove('invalid');});});
  }
  handle('scan-form','/scan-requested');
  handle('contact-form','/message-sent');
})();