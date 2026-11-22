(function () {
  'use strict';
  var status = document.getElementById('connection');
  window.addEventListener('online', function () { status.textContent = '网络已连接，可以重新连接视觉小说社区。'; });
  window.addEventListener('offline', function () { status.textContent = '当前没有网络连接，请稍后重试。'; });
  document.getElementById('retry').addEventListener('click', function () {
    if (location.pathname === '/offline.html') location.replace('/'); else location.reload();
  });
})();
