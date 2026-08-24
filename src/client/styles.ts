/**
 * 客户端插件注入的纯 CSS（自包含，不依赖未验证的原语组件）。
 * 所有类名以 `skp-` 前缀避免与外层样式冲突。
 *
 * 注意：样式正文是一个整体模板字符串。为避免向注入样式里混入无效内容，
 * 模板字符串内部不要写注释；需要说明某段样式时，加在本文件 JS 层
 * （字符串外）即可。样式依赖的主题变量均为 `var(--dsw-alias-*, 回退值)`
 * 形态，外壳未定义时用回退值兜底。
 *
 * @module @dsh-ext/capability-panel/client/styles
 */

export const SKP_CSS = `
.skp-panel{display:flex;flex-direction:column;height:100%;box-sizing:border-box;font:14px/1.5 var(--dsw-font-family,system-ui,sans-serif);color:var(--dsw-alias-label-primary,#1f2328);background:var(--dsw-alias-bg-layer-1,#fff);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2,rgba(0,0,0,.18));--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2,rgba(0,0,0,.3));}
.skp-panel *{box-sizing:border-box;}
.skp-header{flex:none;display:flex;flex-direction:column;gap:10px;padding:14px 16px 12px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.1));}
.skp-title-row{display:flex;align-items:center;justify-content:space-between;gap:8px;}
.skp-title-row h2{margin:0;font-size:15px;font-weight:600;letter-spacing:.01em;}
.skp-title-tools{display:flex;align-items:center;gap:8px;min-width:0;}
.skp-workspace{font-size:12px;color:var(--dsw-alias-label-tertiary,#72808c);max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.skp-close{flex:none;display:grid;place-items:center;width:24px;height:24px;background:none;border:none;border-radius:50%;color:var(--dsw-alias-label-tertiary,#72808c);font-size:12px;line-height:1;cursor:pointer;}
.skp-close:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#1f2328);}
.skp-select{max-width:220px;padding:3px 8px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));border-radius:8px;font:inherit;font-size:12px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-secondary,#4a5661);outline:none;overflow:hidden;text-overflow:ellipsis;}
.skp-select:focus-visible{border-color:var(--dsw-alias-state-business-primary,#3964fe);}
.skp-foot{position:relative;}
.skp-foot-btn{display:flex;align-items:center;gap:8px;width:100%;padding:7px 10px;background:none;border:none;border-radius:8px;font:inherit;font-size:13px;font-weight:500;color:var(--dsw-alias-label-secondary,#4a5661);cursor:pointer;text-align:left;}
.skp-foot-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));color:var(--dsw-alias-label-primary,#1f2328);}
.skp-foot-icon{font-size:14px;line-height:1;}
.skp-foot-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.skp-backdrop{position:fixed;z-index:89;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);}
.skp-popover{position:fixed;z-index:90;left:50%;top:50%;transform:translate(-50%,-50%);width:70vw;height:80vh;min-width:720px;min-height:480px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));border-radius:12px;box-shadow:var(--dsw-shadow-lv3,0 8px 32px rgba(0,0,0,.2));overflow:hidden;background:var(--dsw-alias-bg-layer-1,#fff);}
.skp-tabs{display:flex;gap:2px;padding:2px;background:var(--dsw-alias-bg-module-platform,#f0f2f5);border-radius:8px;}
.skp-tab{flex:1;background:none;border:none;border-radius:6px;padding:4px 10px;font:inherit;font-size:12px;font-weight:500;cursor:pointer;color:var(--dsw-alias-label-secondary,#4a5661);}
.skp-tab:hover{color:var(--dsw-alias-label-primary,#1f2328);}
.skp-tab-active{background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2328);box-shadow:var(--dsw-shadow-lv1,0 1px 2px rgba(0,0,0,.08));}
.skp-search{width:100%;padding:6px 10px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.1));border-radius:8px;font:inherit;font-size:13px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2328);outline:none;}
.skp-search::placeholder{color:var(--dsw-alias-label-tertiary,#72808c);}
.skp-search:focus-visible{border-color:var(--dsw-alias-state-business-primary,#3964fe);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary,#3964fe) 18%,transparent);}
.skp-status,.skp-error{padding:12px 16px;font-size:13px;}
.skp-status{color:var(--dsw-alias-label-tertiary,#72808c);}
.skp-error{color:var(--dsw-alias-state-error-primary,#c53030);}
.skp-body{display:flex;flex:1;min-height:0;}
.skp-list{margin:0;padding:8px;list-style:none;flex:1;min-width:0;overflow:auto;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-scrollbar-bg-l2,rgba(0,0,0,.2)) transparent;}
.skp-list li+li{margin-top:2px;}
.skp-row{display:flex;flex-direction:column;gap:3px;width:100%;text-align:left;background:none;border:none;border-radius:8px;padding:8px 10px;cursor:pointer;font:inherit;color:inherit;}
.skp-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));}
.skp-row-active,.skp-row-active:hover{background:var(--dsw-alias-bg-module-platform,#eef3f8);}
.skp-row-name{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2328);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.skp-row-meta{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-tertiary,#72808c);}
.skp-tag{flex:none;padding:1px 7px;border-radius:999px;font-size:10px;font-weight:600;line-height:15px;letter-spacing:.02em;}
.skp-tag-project{color:var(--dsw-alias-state-business-primary,#3964fe);background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3964fe) 14%,transparent);}
.skp-tag-global{color:var(--dsw-alias-state-success-primary,#1a7f37);background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#1a7f37) 14%,transparent);}
.skp-tag-flat{color:var(--dsw-alias-label-secondary,#4a5661);background:var(--dsw-alias-bg-module-platform,#f0f2f5);}
.skp-tag-directory{color:var(--dsw-alias-state-warn-primary,#b45309);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#b45309) 14%,transparent);}
.skp-tag-readonly{color:var(--dsw-alias-label-tertiary,#72808c);background:var(--dsw-alias-bg-module-platform,#f0f2f5);}
.skp-row-desc{font-size:12px;line-height:1.45;color:var(--dsw-alias-label-secondary,#4a5661);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.skp-empty{color:var(--dsw-alias-label-tertiary,#72808c);padding:16px 12px;font-size:13px;text-align:center;}
.skp-detail{flex:1.4;min-width:0;border-left:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.1));overflow:auto;padding:16px;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-scrollbar-bg-l2,rgba(0,0,0,.2)) transparent;}
.skp-detail-empty{height:100%;display:grid;place-items:center;text-align:center;font-size:13px;color:var(--dsw-alias-label-tertiary,#72808c);}
.skp-detail-card{font-size:13px;color:var(--dsw-alias-label-secondary,#4a5661);}
.skp-detail-card h3{margin:0 0 12px;font-size:17px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2328);}
.skp-detail-fields{margin:0;display:flex;flex-direction:column;gap:2px;}
.skp-detail-fields dt{font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--dsw-alias-label-secondary,#4a5661);}
.skp-detail-fields dd{margin:0 0 12px;min-width:0;}
.skp-detail-fields dd+dt{margin-top:4px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.1));}
.skp-detail-fields dd:last-child{margin-bottom:0;}
.skp-path{display:inline-block;word-break:break-all;font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:12px;background:var(--dsw-alias-bg-module-platform,#f0f2f5);border-radius:6px;padding:4px 6px;}
.skp-detail-actions{margin-top:14px;display:flex;gap:8px;}
.skp-badge{font-size:11px;font-weight:500;padding:2px 10px;border-radius:999px;background:var(--dsw-alias-bg-module-platform,#f0f2f5);color:var(--dsw-alias-label-secondary,#4a5661);}
.skp-domain{display:flex;flex-direction:column;flex:1;min-height:0;}
.skp-subheader{flex:none;display:flex;flex-direction:column;gap:8px;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.1));}
.skp-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:5px 12px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2328);font:inherit;font-size:12px;font-weight:500;cursor:pointer;}
.skp-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));}
.skp-btn:disabled{opacity:.55;cursor:default;}
.skp-btn-primary{background:var(--dsw-alias-state-business-primary,#3964fe);border-color:transparent;color:#fff;}
.skp-btn-primary:hover{background:var(--dsw-alias-state-business-primary-hover,#2f55e0);}
.skp-btn-danger{background:var(--dsw-alias-state-error-primary,#c53030);border-color:transparent;color:#fff;}
.skp-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:baseline;background:var(--dsw-alias-label-tertiary,#a8b2ba);}
.skp-dot-mounted{background:var(--dsw-alias-state-success-primary,#1a7f37);}
.skp-dot-failed{background:var(--dsw-alias-state-error-primary,#c53030);}
.skp-dot-conflict{background:var(--dsw-alias-state-warn-primary,#b45309);}
.skp-dot-none{background:var(--dsw-alias-border-l2,rgba(0,0,0,.18));}
.skp-form{display:flex;flex-direction:column;gap:10px;}
.skp-field{display:flex;flex-direction:column;gap:4px;}
.skp-field-inline{flex-direction:row;align-items:center;gap:8px;font-size:13px;color:var(--dsw-alias-label-secondary,#4a5661);}
.skp-field-label{font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--dsw-alias-label-secondary,#4a5661);}
.skp-input{width:100%;padding:6px 10px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));border-radius:8px;font:inherit;font-size:13px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2328);outline:none;}
.skp-input:focus-visible{border-color:var(--dsw-alias-state-business-primary,#3964fe);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary,#3964fe) 18%,transparent);}
.skp-input:disabled{background:var(--dsw-alias-bg-module-platform,#f0f2f5);color:var(--dsw-alias-label-tertiary,#72808c);}
.skp-textarea{min-height:64px;resize:vertical;font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:12px;line-height:1.5;}
`;

/**
 * 注入样式表（幂等：已存在同 id 的 style 标签则不重复注入）。
 * 返回清理函数，用于插件 stop / 卸载时移除标签。
 */
export function installStyles(): () => void {
  const id = "dsh-capability-panel-css";
  if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${id}"]`) === null) {
    const tag = document.createElement("style");
    tag.dataset.plugin = "@dsh-ext/capability-panel";
    tag.dataset.pluginCss = id;
    tag.textContent = SKP_CSS;
    document.head.appendChild(tag);
    return () => tag.remove();
  }
  return () => undefined;
}
