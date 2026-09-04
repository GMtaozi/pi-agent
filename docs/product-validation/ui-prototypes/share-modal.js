/* ==========================================================================
   pi-agent M2 — 可复用「分享」弹窗
   用法：openShare({ title:'模板名称', type:'template'|'knowledge' })
   依赖：design-system.css（按钮/输入框/分段控件/开关）
   ========================================================================== */
(function () {
  'use strict';
  window.openShare = function (opts) {
    opts = opts || {};
    var title = opts.title || '未命名资源';
    var type = opts.type || 'template';
    var kind = type === 'knowledge' ? '知识库' : '模板';
    var root = document.getElementById('shareRoot');
    if (!root) { root = document.createElement('div'); root.id = 'shareRoot'; document.body.appendChild(root); }
    root.innerHTML = '';

    var backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:60;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(2px)';
    backdrop.setAttribute('data-close-share', '');

    var link = 'https://pi-agent.app/s/' + Math.random().toString(36).slice(2, 10);

    backdrop.innerHTML =
      '<div style="width:100%;max-width:480px;background:var(--bg-secondary);border:1px solid var(--border-strong);border-radius:var(--radius-lg);box-shadow:var(--shadow-elevated);overflow:hidden">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border-color)">' +
          '<div><div style="font-weight:600;font-size:16px">分享 ' + kind + '</div><div class="secondary" style="font-size:12px;margin-top:2px">' + escapeHtml(title) + '</div></div>' +
          '<button class="icon-btn" data-close-share style="width:32px;height:32px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>' +
        '</div>' +
        '<div style="padding:16px 20px">' +
          '<div class="segmented" data-seg-group style="width:100%;margin-bottom:16px">' +
            '<button class="seg-btn active" data-seg style="flex:1;justify-content:center">链接</button>' +
            '<button class="seg-btn" data-seg style="flex:1;justify-content:center">成员</button>' +
            '<button class="seg-btn" data-seg style="flex:1;justify-content:center">发布</button>' +
          '</div>' +
          // panel 链接
          '<div data-seg-panel="link">' +
            '<label class="field-label">分享链接</label>' +
            '<div style="display:flex;gap:8px">' +
              '<input class="input" readonly value="' + link + '" id="shareLink">' +
              '<button class="btn btn-secondary btn-sm" id="copyBtn">复制</button>' +
            '</div>' +
            '<div class="grid grid-cols-2 gap-3 mt-3">' +
              '<div class="field" style="margin:0"><label class="field-label">权限</label><select class="select"><option>仅查看</option><option>可克隆</option><option>可编辑</option></select></div>' +
              '<div class="field" style="margin:0"><label class="field-label">有效期</label><select class="select"><option>7 天</option><option>30 天</option><option>永久</option></select></div>' +
            '</div>' +
            '<label class="flex items-center justify-between mt-3 p-3" style="border:1px solid var(--border-color);border-radius:var(--radius-md)"><span style="font-size:13px">需要登录后访问</span><span class="switch"><input type="checkbox" checked><span class="slider"></span></span></label>' +
          '</div>' +
          // panel 成员
          '<div data-seg-panel="member" style="display:none">' +
            '<div class="flex flex-col gap-2" id="memberList">' +
              memberRow('林知遥 (你)', '管理员', true) +
              memberRow('张伟 · 研发组', '可编辑', false) +
              memberRow('李娜 · 数据组', '可查看', false) +
            '</div>' +
            '<button class="btn btn-ghost btn-sm w-full mt-2" onclick="piToast(\'已邀请成员\')">+ 添加成员 / 团队</button>' +
          '</div>' +
          // panel 发布
          '<div data-seg-panel="publish" style="display:none">' +
            '<label class="flex items-center justify-between p-3 mb-3" style="border:1px solid var(--border-color);border-radius:var(--radius-md);background:var(--accent-light)"><span><div style="font-weight:600;font-size:13px">发布到模板市场</div><div class="secondary" style="font-size:11px">所有人可发现并克隆</div></span><span class="switch"><input type="checkbox" id="pubToggle"><span class="slider"></span></span></label>' +
            '<div class="grid grid-cols-2 gap-3">' +
              '<div class="field" style="margin:0"><label class="field-label">许可证</label><select class="select"><option>CC BY 4.0</option><option>MIT</option><option>私有</option></select></div>' +
              '<div class="field" style="margin:0"><label class="field-label">分类</label><select class="select"><option>客服</option><option>研发</option><option>数据</option><option>通用</option></select></div>' +
            '</div>' +
            '<div class="field" style="margin:0"><label class="field-label">标签（逗号分隔）</label><input class="input" placeholder="客服, 退款, 多语言"></div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;gap:8px;padding:14px 20px;border-top:1px solid var(--border-color)">' +
          '<button class="btn btn-ghost" data-close-share>取消</button>' +
          '<button class="btn btn-primary" id="confirmShare">确认分享</button>' +
        '</div>' +
      '</div>';

    root.appendChild(backdrop);
    document.body.style.overflow = 'hidden';

    backdrop.addEventListener('click', function (e) {
      if (e.target.hasAttribute('data-close-share') || e.target === backdrop) closeShare();
    });
    var copyBtn = backdrop.querySelector('#copyBtn');
    copyBtn.addEventListener('click', function () {
      var inp = backdrop.querySelector('#shareLink'); inp.select();
      try { navigator.clipboard.writeText(inp.value); } catch (e) {}
      piToast('链接已复制');
    });
    var confirm = backdrop.querySelector('#confirmShare');
    confirm.addEventListener('click', function () {
      var active = backdrop.querySelector('[data-seg].active').textContent.trim();
      if (active === '发布' && !backdrop.querySelector('#pubToggle').checked) { piToast('请先开启「发布到模板市场」'); return; }
      piToast('已' + (active === '发布' ? '发布到模板市场' : '分享' + kind));
      closeShare();
    });
    // segmented handled by global design-system.js
    setTimeout(function(){ var s=backdrop.querySelector('[data-seg-group]'); if(s){ s.setAttribute('data-seg-group',''); } },0);
  };

  function closeShare() {
    var root = document.getElementById('shareRoot');
    if (root) root.innerHTML = '';
    document.body.style.overflow = '';
  }
  window.closeShare = closeShare;

  function memberRow(name, role, locked) {
    return '<div class="flex items-center justify-between p-2" style="border:1px solid var(--border-color);border-radius:var(--radius-md)">' +
      '<div style="font-size:13px">' + escapeHtml(name) + (locked ? ' <span class="badge badge-gray" style="font-size:10px">你</span>' : '') + '</div>' +
      '<select class="select" style="width:auto;height:32px;padding:0 28px 0 10px;font-size:12px">' +
        '<option' + (role === '管理员' ? ' selected' : '') + '>管理员</option>' +
        '<option' + (role === '可编辑' ? ' selected' : '') + '>可编辑</option>' +
        '<option' + (role === '可查看' ? ' selected' : '') + '>可查看</option>' +
      '</select></div>';
  }
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
})();
