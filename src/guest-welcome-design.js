export function guestWelcome() {
  return `<dialog class="guest-welcome" data-guest-welcome aria-labelledby="guest-welcome-title" aria-describedby="guest-welcome-description">
    <button class="guest-welcome-close" type="button" data-guest-welcome-dismiss aria-label="关闭注册提示">×</button>
    <div class="guest-welcome-brand"><img src="/img/community/avatar.webp" width="56" height="56" alt="" loading="lazy"><span>初次见面，欢迎来到视觉小说社区</span></div>
    <h2 id="guest-welcome-title">把喜欢的故事，<br>收进自己的书架。</h2>
    <p id="guest-welcome-description">注册并登录后，可以搜索全部作品，记录评分、游玩进度与感想，和同好交流。</p>
    <div class="guest-welcome-features" aria-label="登录后可以使用"><span>全库搜索</span><span>游玩记录</span><span>评论互动</span></div>
    <div class="guest-welcome-actions"><a class="btn btn-primary" href="/register">注册，开始记录 ↗</a><button class="btn" type="button" data-guest-welcome-dismiss autofocus>先逛逛</button></div>
    <p class="guest-welcome-note">游客也可以浏览已收录作品。<a href="/login">已有账号？登录</a></p>
  </dialog>`;
}
