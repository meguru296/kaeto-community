export function installPage() {
  return `<article class="pwa-page" data-pwa-page>
    <header class="pwa-hero">
      <div class="pwa-intro"><p class="pwa-eyebrow">VISUAL NOVEL COMMUNITY / ALWAYS A LITTLE CLOSER</p>
        <h1>把视觉小说社区，<br>放进日常<span>。</span></h1>
        <p class="pwa-lead">给喜欢的故事，留一个桌面上的位置。<br>轻轻一点，回来记录、听歌，和同好相遇。</p>
        <div class="pwa-install-actions"><button class="btn btn-primary" type="button" data-pwa-install hidden>安装视觉小说社区 <span aria-hidden="true">↗</span></button><a href="#pwa-how" class="pwa-guide-link">查看安装方式 ↓</a></div>
        <p class="pwa-install-status" data-pwa-install-status role="status">无需下载单独安装包，使用浏览器即可添加。</p>
      </div>
      <div class="pwa-keepsake"><div class="pwa-app-mark"><img src="/img/site/icon-512.png" alt="星标应用图标" width="132" height="132"><strong>视觉小说社区</strong><span>故事 · 音乐 · 同好</span></div><div class="pwa-note"><span>YOUR EVERYDAY COMPANION</span><p>把故事留在心里，<br>把足迹留在这里。</p><small>视觉小说社区</small></div></div>
    </header>
    <div class="pwa-benefits"><p><b>01 / 桌面直达</b><span>从手机主屏幕或电脑应用中打开。</span></p><p><b>02 / 熟悉的视觉小说社区</b><span>沿用网站账号，记录仍保存在网站。</span></p><p><b>03 / 更新由你决定</b><span>有新版时提醒，等手头的事做完再更新。</span></p></div>
    <section class="pwa-how" id="pwa-how" aria-labelledby="pwa-how-title"><div class="pwa-section-heading"><p class="pwa-eyebrow">A PLACE ON YOUR HOME SCREEN</p><h2 id="pwa-how-title">选你的设备，留一个入口。</h2><p>如果没有出现安装按钮，可以使用浏览器菜单。微信、QQ 等内置浏览器里，请先选择在系统浏览器中打开。</p></div>
      <div class="pwa-device-list"><section><span class="pwa-device-no">01</span><h3>iPhone / iPad</h3><ol><li>在 Safari 中打开视觉小说社区。</li><li>打开分享菜单，选择「添加到主屏幕」。</li><li>若出现「作为网页 App 打开」，保持开启，点击「添加」。</li></ol></section><section><span class="pwa-device-no">02</span><h3>Android</h3><ol><li>在 Chrome 或支持安装的浏览器中打开。</li><li>点击本页的安装按钮，或在浏览器菜单选择「安装应用」／「添加到主屏幕」。</li><li>按系统提示完成添加。</li></ol></section><section><span class="pwa-device-no">03</span><h3>电脑</h3><ol><li>使用 Chrome 或 Edge 打开视觉小说社区。</li><li>点击本页安装按钮，或使用地址栏／浏览器菜单中的安装选项。</li><li>安装后，可从应用列表再次打开。</li></ol><p>Mac 的 Safari 也可通过「文件 → 添加到程序坞」添加。</p></section></div>
    </section>
    <aside class="pwa-footnote"><h2>出发前的小提示</h2><p>浏览作品、登录、评分和消息等功能需要联网。断网时会显示提示页，不会把私人页面保存成离线副本。首次在独立窗口打开时，浏览器可能要求重新登录。</p><p>这是一份轻巧的网页应用：不额外下载整个图库或音乐库，也不会申请通知权限。安装后，原来的网页入口仍然可以照常使用。</p><a href="/">先回视觉小说社区逛逛 ↗</a></aside>
  </article>`;
}

export function pwaControls() {
  return `<div class="pwa-notices" aria-label="应用提示">
    <section class="pwa-notice" data-pwa-connection hidden><p data-pwa-connection-text role="status"></p><button type="button" data-pwa-connection-dismiss aria-label="收起网络提示">×</button></section>
    <section class="pwa-notice pwa-update" data-pwa-update hidden><div><strong>新版本准备好了</strong><p data-pwa-update-text role="status">保存好正在编辑的内容后，再更新。</p></div><div class="pwa-notice-actions"><button class="btn btn-primary btn-sm" type="button" data-pwa-update-apply>更新并重新打开</button><button class="btn btn-ghost btn-sm" type="button" data-pwa-update-later>稍后</button></div></section>
  </div>`;
}
