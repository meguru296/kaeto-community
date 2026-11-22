export const POLICY_VERSION = '2026-11-22';
const documents = {
  terms: {
    title: '用户须知', eyebrow: 'COMMUNITY GUIDELINES', intro: '在这里记录喜欢的故事，也给彼此留一点善意。',
    sections: [
      ['关于本站', '本站是本站运营的非商业同好社区，提供作品资料、评分、游玩记录、评论和交流活动。本站不提供游戏本体、破解文件或盗版下载。活动规则以各活动页面公布的内容为准。'],
      ['账号与内容', '注册需要注册码和邮箱验证。请保管好密码及邮箱验证码，不冒用他人身份，不批量注册或共享账号刷分、刷票。昵称、简介、评分、评价和游玩记录会与 UID 一起公开展示，请不要在这些位置填写手机号、住址或其他人的个人信息。'],
      ['友善交流', '欢迎不同看法，请围绕作品讨论。禁止骚扰辱骂、歧视仇恨、泄露隐私、垃圾广告、诈骗、恶意刷屏以及违法内容。涉及剧情时请主动标注剧透。评论不支持上传图片，可使用本站提供的表情。'],
      ['成人画面与作品封面', '作品的 R18 标识与封面是否露点是两件事。被识别或人工标记的成人封面默认遮挡，登录后主动点击才会显示原图。未成年人请勿查看成人画面，也请勿在公开评价、昵称或简介中发布露骨内容。图片分级可能有遗漏或误判，可以向管理员反馈。'],
      ['管理与反馈', '管理员可处理违规内容、限制违规账号，并维护活动秩序。若你认为内容处理有误，或希望更正、导出、删除账号及记录，请通过交流会联系本站运营者，说明 UID 与具体情况；涉及账号操作时会核实身份。'],
    ],
  },
  privacy: {
    title: '隐私说明', eyebrow: 'PRIVACY & YOUR DATA', intro: '说明我们保存什么、用来做什么，以及哪些内容会公开。',
    sections: [
      ['保存的信息与用途', '我们保存用户名、昵称、UID、头像选择、个人简介、已验证邮箱、加密后的密码验证信息、登录会话，以及你提交的评分、评价、游玩进度和活动记录。若主动绑定 Steam，还会保存经官方验证的 SteamID；Steam 密码不经过本站。邮箱用于身份验证和密码找回；邮箱验证码有有效期且只能使用一次。服务器还可能记录 IP、请求时间和安全操作日志，用于故障排查、限制滥用与安全审计。'],
      ['公开范围', '公开主页和社区页面会显示昵称或用户名、UID、头像、个人简介、评分、评价、游玩记录、角色收藏、巡礼想去和去过地点，以及主动绑定后展示的 SteamID、主页链接及公开的昵称、头像、游戏数量、时长和等级。邮箱、密码验证信息和登录会话不会展示在公开主页。年度分析由超级管理员决定开放时间，个人报告需要本人登录查看。请谨慎填写公开内容。'],
      ['最近在玩', '首页和「群友最近在玩」会在标记为「在玩」的作品旁展示成员昵称、头像和公开主页入口。更改游玩状态后，该作品的在玩成员名单会随记录更新。'],
      ['作品清单与共同编辑', '新清单默认私密。你可主动公开清单，展示标题、描述、标签、作品、推荐语、创建者和协作者等资料，并可开启申请、邀请或允许所有登录成员参与编辑。受邀的协作者可查看并编辑共同维护的私密清单。站内保存与协作有关的邀请、申请、操作和消息，以便管理权限和通知相关成员。'],
      ['资历卡', '资历卡草稿仅本人登录后可查看和保存。姓名、选填的社交账号、入坑年份、角色、作品、偏好和配色等随账号保存，以便换设备继续编辑。浏览器在本机生成 PNG，不上传成图。你自行分享导出的图片时，收件人可看到卡片中所填内容，请先确认分享范围。'],
      ['巡礼手账与照片工具', '你在巡礼模块标记的想去、去过地点及足迹统计会在公开主页展示，角色收藏也公开可见。到访日期和手账感想保存在服务器，仅本人登录可查看，不在公开足迹中输出。管理员维护与备份时可能接触这些记录。本站不要求或读取设备定位，去过标记是个人记录，不代表到访验证。对照图工具只在浏览器内处理你选择的照片并导出图片，不上传照片；关闭工具会释放本次选入的照片，已下载的对照图由你自行保管。'],
      ['外站绑定与记录导入', 'Steam 绑定通过官方授权页面验证，本站不索取 Steam 密码、不读取库存和购买记录；绑定后卡片公开显示 SteamID、昵称、头像、公开游戏数量、累计时长、近两周时长和等级；这些资料会缓存用于卡片展示，本人可以刷新或解除绑定。Bangumi 导入仅读取你指定账号的公开游戏收藏，临时预览限时保存，确认后按本站记录格式补齐空白字段，不覆盖已有记录，不回写 Bangumi。评价默认不导入，勾选后会公开显示。访问这些外站时适用其服务规则。'],
      ['评论互动与站内消息', '评论回复公开展示，点赞保存点赞者与评价的关联及状态。收到的点赞、回复和版本更新通知仅在本人登录后的消息中心展示，保存未读和已读状态，不发送通知邮件，不提供成员之间的私信。回复作者可以删除自己的回复，删除后保留不含正文的占位以维持讨论关系；收到的互动通知保留最近 300 条，版本通知单独保留。'],
      ['服务器与服务商', '服务器和备份的位置由站点运营者确定，请参阅本实例公布的信息。网站通过服务器托管、DNS、HTTPS 证书和邮箱服务完成访问与验证码发送；这些服务商会按各自规则处理必要的网络或邮件信息。作品资料与部分图片来自月幕、VNDB、Bangumi 或 Anitabi；公共取景图片会在本站缓存，缺少缓存时可能从原站加载。加载第三方图片或访问其外链时适用对方的规则。'],
      ['Cookie 与本地存储', '必要的登录 Cookie 用于维持会话；浏览器可缓存公开图片、样式和脚本以提升重复访问速度。登录后的受限封面原图不进入本站的公共离线缓存。浏览器还会记录你是否确认过本版注册须知，以避免重复弹窗。清除浏览器数据可能需要重新登录或再次确认。本站不使用这些信息进行广告画像。'],
      ['数据管理与安全', '你可以在个人中心修改昵称、头像及简介，并更新自己的评分、评价和游玩记录。导出、删除账号或更正其他账号数据，请联系本站运营者并提供 UID。我们使用 HTTPS、密码加密验证、权限检查和请求限制等措施保护数据；请避免重复使用密码，不向任何人提供验证码。'],
    ],
  },
  disclaimer: {
    title: '免责声明与版权说明', eyebrow: 'SOURCES & RESPONSIBILITIES', intro: '尊重作品、作者与每一位记录故事的人。',
    sections: [
      ['资料与评价', '作品名称、品牌、发行日期、封面、截图及角色资料可能由第三方接口或人工整理提供，存在更新延迟、版本差异或错误。评分和评论代表用户个人看法，不能作为购买、下载或其他决定的保证。发现错误时欢迎反馈。'],
      ['巡礼资料与出行', '巡礼地标和截图来自 Anitabi 等公开资料，地区分类为辅助整理，可能存在误差、版本差异或已拆除地点。请出发前核实开放时间、交通与现场情况，遵守当地规则、拍摄要求和场所管理，不进入禁止进入的区域，不打扰当地居民。游戏与动画改编取景可能不同，手账标记和纪念印章不代表本站对到访真实性的认证。'],
      ['版权与素材', '游戏封面、截图、角色图片及名称的相关权利属于各自权利人；社区素材、群刊文章和用户内容亦保留其原作者权益。非商业展示不等于取得所有素材的再使用许可。请勿擅自搬运、冒充作者或将本站素材用于商业用途。权利人可通过交流会联系本站运营者，提供作品信息、权属依据和具体页面；核实后将更正署名或下架相关内容。'],
      ['外链与服务可用性', '外部链接由各对应网站负责运营。请自行核实外部页面内容，注意账号与下载安全。维护、网络波动或第三方接口异常可能造成访问缓慢、资料缺失或服务中断，我们会尽力处理，但不承诺持续无故障运行。'],
      ['责任与规则更新', '本站会对收到的内容与权益反馈进行核实和处理。本说明不免除本站依法应承担的责任，也不限制用户依法享有的权利。规则变更会更新本页面的版本和日期；重要变更会另行说明。'],
    ],
  },
};
export function policyPage(kind = 'terms') {
  const entry = documents[kind];
  if (!entry) return null;
  return { title: entry.title, body: `<article class="pl-page"><header><p class="pl-eyebrow">${entry.eyebrow}</p><h1>${entry.title}</h1><p>${entry.intro}</p><small>版本 / 更新日期：${POLICY_VERSION}</small></header><nav class="pl-nav" aria-label="站点规则">${Object.entries(documents).map(([key,value])=>`<a href="/policies${key === 'terms' ? '' : '/' + key}" ${key === kind ? 'aria-current="page"' : ''}>${value.title}</a>`).join('')}</nav><div class="pl-sections">${entry.sections.map(([title,text],i)=>`<section><span>${String(i+1).padStart(2,'0')}</span><div><h2>${title}</h2><p>${text}</p></div></section>`).join('')}</div><aside class="pl-contact">需要反馈或处理账号资料？请联系本站运营者，并提供 UID 与相关页面。<a href="/about">关于交流会 ↗</a></aside></article>` };
}
export function registrationNotice() {
  return `<dialog class="pl-notice" data-registration-notice="${POLICY_VERSION}" aria-labelledby="registration-notice-title"><header><img src="/img/community/member-avatar.webp" alt="" width="52" height="52"><div><p class="pl-eyebrow">BEFORE YOUR FIRST SAVE</p><h2 id="registration-notice-title">加入之前，花一点时间看看。</h2></div><button type="button" data-close-notice aria-label="暂时关闭须知">×</button></header><div class="pl-notice-body"><p>欢迎来到本站。以下说明适用于本站账号、游玩记录和社区互动。</p><section><h3>友善交流，尊重作品</h3><p>不骚扰、不泄露隐私，不刷分刷票；涉及剧情请标注剧透。本站不提供游戏本体或盗版下载。</p></section><section><h3>知道哪些信息会公开</h3><p>昵称、UID、简介、评分、评价、游玩记录、角色收藏及巡礼足迹会公开，手账感想和到访日期仅本人可见。邮箱用于验证和密码找回，服务器位置请以本实例公布的信息为准。请勿在公开内容中填写敏感个人信息。</p></section><section><h3>留意成人画面与素材版权</h3><p>露点封面默认遮挡，登录后主动点击才能查看；未成年人请勿查看成人画面。资料可能有误差，图片及文章的权利属于各自权利人。</p></section><nav aria-label="完整站点说明"><a href="/policies" target="_blank" rel="noopener">完整用户须知 ↗</a><a href="/policies/privacy" target="_blank" rel="noopener">隐私说明 ↗</a><a href="/policies/disclaimer" target="_blank" rel="noopener">免责声明 ↗</a></nav></div><footer><a href="/login" class="btn">暂不注册</a><button type="button" class="btn btn-primary" data-accept-notice>我已阅读并同意，继续注册 →</button><small>确认后不再自动弹出，完整说明可从页脚查看。</small></footer></dialog>`;
}
export function registrationConsent() {
  return `<label class="pl-consent"><input type="checkbox" name="policyVersion" value="${POLICY_VERSION}" required data-policy-consent><span>我已阅读并同意<a href="/policies" target="_blank" rel="noopener">用户须知</a>与<a href="/policies/privacy" target="_blank" rel="noopener">隐私说明</a>，知悉<a href="/policies/disclaimer" target="_blank" rel="noopener">免责声明</a>。<button type="button" data-open-notice>查看注册须知</button></span></label>`;
}
