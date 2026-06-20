// admin.js - 管理员本地视频上传管理 v1.0
(function(){
  var ADMIN_KEY = '_ai_admin';
  var ADMIN_PW = 'azhdzjtzy00';
  var MAX_SIZE = 200 * 1024 * 1024;

  // ====== Auth ======
  function isAdmin(){ return sessionStorage.getItem(ADMIN_KEY) === '1'; }
  function login(pw){
    if(pw === ADMIN_PW){ sessionStorage.setItem(ADMIN_KEY,'1'); return true; }
    return false;
  }
  function logout(){ sessionStorage.removeItem(ADMIN_KEY); }

  // ====== IndexedDB ======
  function openDB(){
    return new Promise(function(rs,rj){
      var r = indexedDB.open('AI_Videos', 1);
      r.onupgradeneeded = function(e){ e.target.result.createObjectStore('videos'); };
      r.onsuccess = function(e){ rs(e.target.result); };
      r.onerror = function(){ rj(); };
    });
  }
  function saveVideo(key, file){
    return openDB().then(function(db){
      return new Promise(function(rs,rj){
        var tx = db.transaction('videos','readwrite');
        tx.objectStore('videos').put(file, key);
        tx.oncomplete = function(){ rs(); };
        tx.onerror = function(){ rj(); };
      });
    });
  }
  function getVideo(key){
    return openDB().then(function(db){
      return new Promise(function(rs){
        var tx = db.transaction('videos','readonly');
        var req = tx.objectStore('videos').get(key);
        req.onsuccess = function(){ rs(req.result); };
        req.onerror = function(){ rs(null); };
      });
    });
  }
  function deleteVideo(key){
    return openDB().then(function(db){
      return new Promise(function(rs,rj){
        var tx = db.transaction('videos','readwrite');
        tx.objectStore('videos').delete(key);
        tx.oncomplete = function(){ rs(); };
        tx.onerror = function(){ rj(); };
      });
    });
  }
  function listKeys(){
    return openDB().then(function(db){
      return new Promise(function(rs){
        var tx = db.transaction('videos','readonly');
        var req = tx.objectStore('videos').getAllKeys();
        req.onsuccess = function(){ rs(req.result); };
        req.onerror = function(){ rs([]); };
      });
    });
  }

  // ====== UI Builders ======
  function makeBtn(text, cls, click){
    var b = document.createElement('button');
    b.className = 'au-btn ' + (cls||'');
    b.textContent = text;
    b.onclick = function(e){ e.stopPropagation(); e.preventDefault(); click(e); };
    return b;
  }
  function makeUploadArea(key, label, onUpdate){
    var wrap = document.createElement('div');
    wrap.className = 'au-area';
    wrap.setAttribute('data-vkey', key);

    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'video/mp4';
    fileInput.className = 'au-file';
    fileInput.onchange = function(){
      var f = fileInput.files[0];
      if(!f) return;
      if(f.type !== 'video/mp4'){ alert('仅支持MP4格式视频'); return; }
      if(f.size > MAX_SIZE){ alert('文件超过200MB限制，当前大小：'+(f.size/1024/1024).toFixed(1)+'MB'); return; }
      saveVideo(key, f).then(function(){
        renderPreview(wrap, key, f, onUpdate);
      });
    };

    var uploadBtn = makeBtn(label || '上传本地教学视频', 'au-upload');
    uploadBtn.onclick = function(e){ e.stopPropagation(); e.preventDefault(); fileInput.click(); };

    var hint = document.createElement('div');
    hint.className = 'au-hint';
    hint.textContent = '视频仅保存在本机浏览器，清除缓存将丢失文件';

    wrap.appendChild(uploadBtn);
    wrap.appendChild(fileInput);
    wrap.appendChild(hint);

    // Check existing video
    getVideo(key).then(function(blob){
      if(blob){ renderPreview(wrap, key, blob, onUpdate); }
    });

    return wrap;
  }

  function renderPreview(wrap, key, blob, onUpdate){
    // Clear existing preview
    var old = wrap.querySelector('.au-preview');
    if(old) old.remove();

    var prev = document.createElement('div');
    prev.className = 'au-preview';

    var url = URL.createObjectURL(blob);
    var vid = document.createElement('video');
    vid.src = url;
    vid.controls = true;
    vid.preload = 'metadata';
    vid.className = 'au-video';
    vid.setAttribute('playsinline','');

    // Pause on collapse
    var observer = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if(!e.isIntersecting && !vid.paused) vid.pause();
      });
    }, {threshold: 0});
    observer.observe(vid);

    var actions = document.createElement('div');
    actions.className = 'au-actions';
    actions.appendChild(makeBtn('替换视频', 'au-replace', function(){
      var fi = wrap.querySelector('.au-file');
      fi.click();
    }));
    actions.appendChild(makeBtn('删除视频', 'au-del', function(){
      if(!confirm('确认删除此视频？删除后不可恢复。')) return;
      deleteVideo(key).then(function(){
        URL.revokeObjectURL(url);
        prev.remove();
        if(onUpdate) onUpdate();
      });
    }));

    prev.appendChild(vid);
    prev.appendChild(actions);
    wrap.appendChild(prev);
  }

  // ====== Episode Upload (课程级) ======
  function injectEpisodeUploads(){
    var eps = document.querySelectorAll('.ep-item');
    eps.forEach(function(ep){
      if(ep.querySelector('.au-area')) return;
      var ch = ep.getAttribute('data-ch') || '';
      var epNum = ep.getAttribute('data-ep') || '';
      if(!ch || !epNum) return;
      var key = 'ep_' + ch + '_' + epNum;

      var body = ep.querySelector('.ep-body');
      if(!body) return;
      var area = makeUploadArea(key, '上传教学视频');
      body.appendChild(area);
    });
  }

  // ====== Position Upload (岗位级) ======
  function injectPositionUploads(){
    var items = document.querySelectorAll('.job-item');
    items.forEach(function(item, idx){
      if(item.querySelector('.au-area')) return;
      var panel = item.closest('.job-panel');
      if(!panel) return;
      var card = panel.closest('.category-card');
      var ch = card ? card.getAttribute('data-ch') : '';
      if(!ch) return;
      // Find position within its card
      var allItems = card.querySelectorAll('.job-item');
      var posIdx = -1;
      for(var i = 0; i < allItems.length; i++){
        if(allItems[i] === item){ posIdx = i; break; }
      }
      if(posIdx < 0) return;
      var key = 'pos_' + ch + '_' + posIdx;

      var area = makeUploadArea(key, '上传岗位实操视频');
      var posEl = item.querySelector('.job-pos');
      if(posEl){
        posEl.parentNode.insertBefore(area, posEl.nextSibling);
      } else {
        item.appendChild(area);
      }
    });
  }

  // ====== Admin Login UI ======
  function injectLoginButton(){
    if(document.getElementById('au-login-btn')) return;
    var nav = document.querySelector('.top-nav-inner');
    if(!nav) return;

    var btn = document.createElement('button');
    btn.id = 'au-login-btn';
    btn.className = 'au-login-btn';
    btn.textContent = '管理';

    btn.onclick = function(e){
      e.preventDefault(); e.stopPropagation();
      if(isAdmin()){
        if(confirm('退出管理员模式？')){ logout(); location.reload(); }
        return;
      }
      var pw = prompt('请输入管理员密码\n（管理员专属后台上传功能，访客无操作权限）');
      if(pw === null) return;
      if(login(pw)){
        alert('登录成功，页面刷新后显示上传控件');
        location.reload();
      } else {
        alert('密码错误');
      }
    };

    if(isAdmin()){
      btn.textContent = '管理✓';
      btn.style.color = '#10b981';
    }
    nav.appendChild(btn);
  }

  // ====== Init ======
  function init(){
    injectLoginButton();
    if(!isAdmin()) return;
    // Admin: inject upload areas
    setTimeout(function(){
      injectEpisodeUploads();
      injectPositionUploads();
    }, 300);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
