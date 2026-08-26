window.__ModuleLoader__.load({
	id: "@chengdb/capability-panel",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/channel.ts
		/**
		* RPC 通道名常量——宿主端与浏览器端共享的唯一通道标识。
		*
		* 面板的宿主服务（skills / mcp 两个域）与浏览器客户端之间不开放插件的
		* `/api` 单次路由表（见 remote.ts 的详细说明），统一走这条泛型通道通信：
		*
		*   - 宿主端：ctx.get("connection").rpc.handle("/capability-panel", handler, options)
		*   - 客户端：ctx.get("connection").rpc.call("/capability-panel", endpoint, payload, signal)
		*
		* 两端源码各自 import 这个常量，而不是各自硬编码字符串，避免通道名拼写漂移：
		* 改名只需要动这一处。
		*
		* @module @chengdb/capability-panel/channel
		*/
		const CHANNEL = "/capability-panel";
		//#endregion
		//#region src/client/api-adapter.ts
		/**
		* `CapabilityPanelApi` 的 Web 客户端适配器：每个调用都走插件自有 RPC 通道
		* （`/capability-panel`，见 channel.ts），endpoint 按域前缀命名
		* （`skills.*` / `mcp.*`，见 remote.ts 的路由表）。
		*
		* 这里负责：包上信封 → 调用通道 → 解信封（失败抛错）→ 把宿主返回的
		* 普通对象投影成客户端类型（见 toSummary）。
		*
		* @module @chengdb/capability-panel/client/api-adapter
		*/
		/** 构建传输无关的面板 API（RPC 实现）。 */
		function createPanelApi(deps) {
			/** 调用一次宿主 RPC，并把响应归一成与旧信封同构的 RawResult。 */
			async function rpc(endpoint, payload, signal) {
				const raw = await deps.rpc.call(CHANNEL, endpoint, payload, signal);
				if (raw && typeof raw === "object" && "ok" in raw) {
					const record = raw;
					if (record.ok === true && record.value !== null && typeof record.value === "object") {
						const inner = record.value;
						if (inner.ok === false && Array.isArray(inner.errors)) return {
							ok: false,
							errors: inner.errors
						};
						return raw;
					}
					return {
						ok: false,
						errors: Array.isArray(record.errors) ? record.errors : [typeof record.message === "string" ? record.message : "操作失败"]
					};
				}
				return {
					ok: false,
					errors: [`unexpected response from ${CHANNEL}`]
				};
			}
			/**
			* 解开双层信封：宿主编排层把业务结果（CreateResult / TransferResult 等
			* 自带 ok/errors 的形状）包进 RPC 信封 `{ ok: true, value }`，所以信封
			* ok 不代表业务成功。value 自身带 ok 字段时以业务层为准。
			*/
			function unwrap(result) {
				if (result.ok && result.value !== null && typeof result.value === "object" && "ok" in result.value) return result.value;
				return result;
			}
			return {
				skills: {
					/** 列表：把宿主返回的普通对象逐条投影成 ClientSkillSummary。 */
					async list() {
						const result = await rpc("skills.list", { cwd: deps.currentWorkspaceCwd() });
						if (!result.ok) throw new Error(result.errors.join("; "));
						return result.value.filter((v) => v !== null && typeof v === "object").map(toSummary);
					},
					/** 详情：宿主可能返回 undefined（不存在）。 */
					async read(name) {
						const result = await rpc("skills.read", {
							name,
							cwd: deps.currentWorkspaceCwd()
						});
						if (!result.ok) throw new Error(result.errors.join("; "));
						const detail = result.value;
						if (detail === void 0) return void 0;
						return detail;
					},
					async create(input) {
						const cwd = deps.currentWorkspaceCwd();
						return unwrap(await rpc("skills.create", {
							...input,
							cwd
						}));
					},
					async update(input) {
						const cwd = deps.currentWorkspaceCwd();
						return unwrap(await rpc("skills.update", {
							...input,
							cwd
						}));
					},
					async remove(input) {
						const cwd = deps.currentWorkspaceCwd();
						return unwrap(await rpc("skills.remove", {
							...input,
							cwd
						}));
					},
					/** 一键启用/禁用：与服务端同名词条一致，直接返回信封。 */
					async setEnabled(input) {
						const cwd = deps.currentWorkspaceCwd();
						return unwrap(await rpc("skills.setEnabled", {
							...input,
							cwd
						}));
					},
					/** 上传安装：解开信封后投影成 InstallResult。 */
					async installUpload(input) {
						const cwd = deps.currentWorkspaceCwd();
						return toInstallResult(unwrap(await rpc("skills.install", {
							...input,
							cwd
						})));
					},
					/** 宿主路径安装。 */
					async installFromPath(input) {
						const cwd = deps.currentWorkspaceCwd();
						return toInstallResult(unwrap(await rpc("skills.install", {
							...input,
							cwd
						})));
					},
					/** URL 下载安装（GitHub 仓库 / .zip / raw .md）。 */
					async installFromUrl(input) {
						const cwd = deps.currentWorkspaceCwd();
						return toInstallResult(unwrap(await rpc("skills.install", {
							...input,
							cwd
						})));
					},
					/** 导出为文件清单：解开信封后按宿主返回的形状投影。 */
					async exportFiles(input) {
						const cwd = deps.currentWorkspaceCwd();
						const result = unwrap(await rpc("skills.export", {
							...input,
							cwd
						}));
						if (!result.ok) return {
							ok: false,
							errors: result.errors
						};
						const self = result;
						if (!Array.isArray(self.files)) return {
							ok: false,
							errors: ["export returned no files"]
						};
						return {
							ok: true,
							name: typeof self.name === "string" ? self.name : input.name,
							format: self.format === "directory" ? "directory" : "flat",
							files: self.files
						};
					},
					/** 导出到宿主目录。 */
					async exportToPath(input) {
						const cwd = deps.currentWorkspaceCwd();
						return unwrap(await rpc("skills.export", {
							...input,
							cwd
						}));
					}
				},
				mcp: {
					/** 列表：宿主的合并视图直接可用，无需投影。 */
					async list() {
						const result = await rpc("mcp.list", { cwd: deps.currentWorkspaceCwd() });
						if (!result.ok) throw new Error(result.errors.join("; "));
						return result.value;
					},
					async upsert(input) {
						const cwd = deps.currentWorkspaceCwd();
						return rpc("mcp.upsert", {
							...input,
							cwd
						});
					},
					async remove(input) {
						const cwd = deps.currentWorkspaceCwd();
						return rpc("mcp.remove", {
							...input,
							cwd
						});
					},
					async setEnabled(input) {
						const cwd = deps.currentWorkspaceCwd();
						return rpc("mcp.setEnabled", {
							...input,
							cwd
						});
					},
					async status() {
						const result = await rpc("mcp.status", { cwd: deps.currentWorkspaceCwd() });
						if (!result.ok) throw new Error(result.errors.join("; "));
						return result.value;
					}
				},
				quickMessages: {
					/** 列表：宿主的合并视图直接可用，无需投影。 */
					async list() {
						const result = await rpc("quick.list", { cwd: deps.currentWorkspaceCwd() });
						if (!result.ok) throw new Error(result.errors.join("; "));
						return result.value;
					},
					async upsert(input) {
						const cwd = deps.currentWorkspaceCwd();
						return unwrap(await rpc("quick.upsert", {
							...input,
							cwd
						}));
					},
					async remove(input) {
						const cwd = deps.currentWorkspaceCwd();
						return unwrap(await rpc("quick.remove", {
							...input,
							cwd
						}));
					},
					async setEnabled(input) {
						const cwd = deps.currentWorkspaceCwd();
						return unwrap(await rpc("quick.setEnabled", {
							...input,
							cwd
						}));
					}
				},
				workspaceLabel() {
					return deps.currentWorkspaceCwd() ?? "（无工作区）";
				},
				selectedProject() {
					return deps.selectedProject();
				},
				selectProject(path) {
					deps.selectProject(path);
				},
				projects() {
					return deps.listProjects();
				},
				subscribeWorkspace(listener) {
					return deps.subscribeWorkspace(listener);
				}
			};
		}
		/**
		* 把宿主返回的行对象投影成客户端摘要：
		* 调用策略是嵌套的 `invocation` 对象 → 拍平成两个布尔；
		* 其它字段做了宽松的字符串归一，防御宿主侧数据漂移。
		*/
		function toSummary(value) {
			const inv = value.invocation ?? {};
			return {
				name: String(value.name),
				description: String(value.description ?? ""),
				...typeof value.whenToUse === "string" ? { whenToUse: value.whenToUse } : {},
				modelInvocable: inv.modelInvocable !== false,
				userInvocable: inv.userInvocable !== false,
				source: String(value.source ?? "unknown"),
				format: value.format === "directory" ? "directory" : "flat",
				readOnly: value.readOnly === true,
				...typeof value.path === "string" ? { path: value.path } : {},
				...typeof value.root === "string" ? { root: value.root } : {}
			};
		}
		/** 把解开信封后的安装结果投影成 InstallResult（防御宿主侧数据漂移）。 */
		function toInstallResult(result) {
			if (!result.ok) return {
				ok: false,
				errors: result.errors
			};
			const self = result;
			return {
				ok: true,
				...typeof self.name === "string" ? { name: self.name } : {},
				...self.existed === true ? { existed: true } : {}
			};
		}
		//#endregion
		//#region src/client/styles.ts
		/**
		* 客户端插件注入的纯 CSS（自包含，不依赖未验证的原语组件）。
		* 所有类名以 `skp-` 前缀避免与外层样式冲突。
		*
		* 设计语言：现代 / 扁平 / 简约。
		*   - 颜色集中在 `.skp-panel` 上的一组 `--skp-*` 设计令牌（全部回退到
		*     `--dsw-alias-*` 主题变量，外壳未定义时用中性色兜底）；
		*   - 控件一律扁平：无渐变、无重阴影，边界用 8% 透明度的细线；
		*   - 强调色只出现在主按钮、选中态与 project 标签上，其余界面保持中性灰；
		*   - 下拉框（SkpSelect，见 select.tsx）完全自绘：按钮 + fixed 弹出列表，
		*     不使用原生 <select>（其选项列表不可定制样式）。
		*
		* 注意：样式正文是一个整体模板字符串。为避免向注入样式里混入无效内容，
		* 模板字符串内部不要写注释；需要说明某段样式时，加在本文件 JS 层
		* （字符串外）即可。
		*
		* @module @chengdb/capability-panel/client/styles
		*/
		const SKP_CSS = `
.skp-panel{--skp-accent:var(--dsw-alias-state-business-primary,#4176e6);--skp-accent-hover:var(--dsw-alias-button-info-hover,color-mix(in srgb,var(--skp-accent) 88%,#000));--skp-accent-soft:var(--dsw-alias-state-business-tertiary,color-mix(in srgb,var(--skp-accent) 10%,transparent));--skp-on-accent:var(--dsw-alias-label-primary-foreground,#fff);--skp-success-soft:var(--dsw-alias-state-success-tertiary,color-mix(in srgb,var(--dsw-alias-state-success-primary,#189a52) 12%,transparent));--skp-warn-soft:var(--dsw-alias-state-warn-tertiary,color-mix(in srgb,var(--dsw-alias-state-warn-primary,#c26a0a) 12%,transparent));--skp-mask:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.45));--skp-text:var(--dsw-alias-label-primary,#1b1f26);--skp-text-2:var(--dsw-alias-label-secondary,#5b6472);--skp-text-3:var(--dsw-alias-label-tertiary,#8b95a1);--skp-border:var(--dsw-alias-border-l2,rgba(20,28,40,.08));--skp-border-strong:var(--dsw-alias-border-l3,rgba(20,28,40,.16));--skp-fill:var(--dsw-alias-bg-module-platform,#f2f4f7);--skp-hover:var(--dsw-alias-interactive-bg-hover,rgba(20,28,40,.05));--skp-surface:var(--dsw-alias-bg-layer-1,#fff);--skp-success:var(--dsw-alias-state-success-primary,#189a52);--skp-warn:var(--dsw-alias-state-warn-primary,#c26a0a);--skp-error:var(--dsw-alias-state-error-primary,#d64545);--skp-radius:10px;--skp-radius-sm:8px;--skp-ease:cubic-bezier(.2,.8,.3,1);display:flex;flex-direction:column;height:100%;box-sizing:border-box;font:15px/1.55 var(--dsw-font-family,system-ui,sans-serif);color:var(--skp-text);background:var(--skp-surface);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2,rgba(0,0,0,.16));--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2,rgba(0,0,0,.28));}
.skp-panel *{box-sizing:border-box;}
.skp-header{flex:none;display:flex;flex-direction:column;gap:14px;padding:18px 20px 14px;border-bottom:1px solid var(--skp-border);}
.skp-title-row{display:flex;align-items:center;justify-content:space-between;gap:12px;}
.skp-title-main{display:flex;align-items:baseline;gap:10px;min-width:0;}
.skp-title-main h2{margin:0;font-size:17px;font-weight:600;letter-spacing:.01em;}
.skp-title-tools{display:flex;align-items:center;gap:10px;flex:none;min-width:0;}
.skp-workspace{font-size:12.5px;color:var(--skp-text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.skp-close{flex:none;display:grid;place-items:center;width:30px;height:30px;background:none;border:none;border-radius:var(--skp-radius-sm);color:var(--skp-text-3);font-size:13px;line-height:1;cursor:pointer;transition:background-color .15s var(--skp-ease),color .15s var(--skp-ease);}
.skp-close:hover{background:var(--skp-hover);color:var(--skp-text);}
.skp-foot{position:relative;}
.skp-foot-btn{display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;background:none;border:none;border-radius:var(--skp-radius-sm);font:inherit;font-size:14px;font-weight:500;color:var(--skp-text-2);cursor:pointer;text-align:left;transition:background-color .15s var(--skp-ease),color .15s var(--skp-ease);}
.skp-foot-btn:hover{background:var(--skp-hover);color:var(--skp-text);}
.skp-foot-icon{font-size:15px;line-height:1;}
.skp-foot-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.skp-backdrop{position:fixed;z-index:89;inset:0;background:var(--skp-mask);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);}
.skp-popover{position:fixed;z-index:90;inset:0;margin:auto;width:74vw;height:84vh;min-width:820px;min-height:560px;border:1px solid var(--skp-border);border-radius:16px;box-shadow:0 24px 64px rgba(15,20,30,.22),0 4px 16px rgba(15,20,30,.1);overflow:hidden;background:var(--skp-surface);}
.skp-tabs{display:flex;gap:2px;padding:3px;background:var(--skp-fill);border-radius:var(--skp-radius);}
.skp-tab{flex:1;background:none;border:none;border-radius:var(--skp-radius-sm);padding:7px 16px;font:inherit;font-size:13px;font-weight:500;cursor:pointer;color:var(--skp-text-3);white-space:nowrap;transition:color .15s var(--skp-ease),background-color .15s var(--skp-ease),box-shadow .15s var(--skp-ease);}
.skp-tab:hover{color:var(--skp-text);}
.skp-tab-active{background:var(--skp-surface);color:var(--skp-text);box-shadow:0 1px 2px rgba(20,28,40,.08),0 0 0 1px var(--skp-border);}
.skp-search{width:100%;height:36px;padding:0 12px 0 36px;border:1px solid var(--skp-border);border-radius:var(--skp-radius-sm);font:inherit;font-size:13.5px;background:var(--skp-surface) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='%238b95a1' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='7'/%3E%3Cpath d='m21 21-4.3-4.3'/%3E%3C/svg%3E") no-repeat 11px center/15px 15px;color:var(--skp-text);outline:none;transition:border-color .15s var(--skp-ease),box-shadow .15s var(--skp-ease);}
.skp-search::placeholder{color:var(--skp-text-3);}
.skp-search:focus-visible{border-color:var(--skp-border-strong);box-shadow:0 0 0 3px var(--dsw-alias-interactive-bg-active,rgba(20,28,40,.08));}
.skp-search::-webkit-search-cancel-button{cursor:pointer;}
.skp-status,.skp-error{padding:12px 18px;font-size:13.5px;}
.skp-status{color:var(--skp-text-3);}
.skp-error{color:var(--skp-error);background:color-mix(in srgb,var(--skp-error) 7%,transparent);white-space:pre-wrap;}
.skp-body{display:flex;flex:1;min-height:0;}
.skp-list{margin:0;padding:10px;list-style:none;flex:none;width:320px;overflow:auto;border-right:1px solid var(--skp-border);scrollbar-width:thin;scrollbar-color:var(--dsw-alias-scrollbar-bg-l2,rgba(0,0,0,.18)) transparent;}
.skp-list li+li{margin-top:3px;}
.skp-row{position:relative;display:flex;flex-direction:column;gap:5px;width:100%;text-align:left;background:none;border:none;border-radius:var(--skp-radius);padding:10px 14px;cursor:pointer;font:inherit;color:inherit;transition:background-color .12s var(--skp-ease);}
.skp-row:hover{background:var(--skp-hover);}
.skp-row-active,.skp-row-active:hover{background:var(--dsw-alias-interactive-bg-active,rgba(20,28,40,.08));}
.skp-row-name{display:flex;align-items:center;min-width:0;font-size:14px;font-weight:600;color:var(--skp-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.skp-row-meta{display:flex;align-items:center;flex-wrap:wrap;gap:6px;font-size:12px;color:var(--skp-text-3);}
.skp-tag{flex:none;padding:0 8px;border-radius:6px;font-size:11px;font-weight:600;line-height:19px;letter-spacing:.02em;}
.skp-tag-project{color:var(--skp-accent);background:var(--skp-accent-soft);}
.skp-tag-global{color:var(--skp-success);background:var(--skp-success-soft);}
.skp-tag-flat{color:var(--skp-text-3);background:var(--skp-fill);}
.skp-tag-directory{color:var(--skp-warn);background:var(--skp-warn-soft);}
.skp-tag-readonly{color:var(--skp-text-3);background:var(--skp-fill);}
.skp-row-desc{font-size:13px;line-height:1.5;color:var(--skp-text-3);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.skp-empty{color:var(--skp-text-3);padding:28px 12px;font-size:13.5px;text-align:center;list-style:none;}
.skp-detail{flex:1;min-width:0;overflow:auto;padding:22px 24px;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-scrollbar-bg-l2,rgba(0,0,0,.18)) transparent;}
.skp-detail-empty{height:100%;display:grid;place-items:center;text-align:center;font-size:13.5px;color:var(--skp-text-3);}
.skp-detail-card{font-size:14px;color:var(--skp-text-2);}
.skp-detail-card>h3{margin:0 0 16px;font-size:18px;font-weight:600;color:var(--skp-text);}
.skp-detail-head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:16px;}
.skp-detail-head h3{margin:0;font-size:18px;font-weight:600;color:var(--skp-text);min-width:0;overflow:hidden;text-overflow:ellipsis;}
.skp-detail-fields{margin:0;display:flex;flex-direction:column;gap:2px;}
.skp-detail-fields dt{font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--skp-text-3);}
.skp-detail-fields dd{margin:0 0 14px;min-width:0;}
.skp-detail-fields dd+dt{margin-top:6px;padding-top:14px;border-top:1px solid var(--skp-border);}
.skp-detail-fields dd:last-child{margin-bottom:0;}
.skp-path{display:inline-block;word-break:break-all;font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:13px;background:var(--skp-fill);border-radius:6px;padding:4px 8px;}
.skp-detail-actions{display:flex;align-items:center;gap:8px;flex:none;}
.skp-detail-enable{display:inline-flex;align-items:center;gap:6px;flex:none;}
.skp-detail-enable-label{font-size:12px;color:var(--skp-text-3);white-space:nowrap;}
.skp-form .skp-detail-actions{margin-top:6px;}
.skp-badge{flex:none;font-size:12px;font-weight:600;padding:4px 12px;border-radius:999px;background:var(--skp-fill);color:var(--skp-text-2);}
.skp-domain{display:flex;flex-direction:column;flex:1;min-height:0;}
.skp-subheader{flex:none;display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid var(--skp-border);}
.skp-subheader .skp-tabs{flex:none;}
.skp-subheader .skp-search{flex:1;min-width:0;}
.skp-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:28px;padding:0 12px;border:1px solid var(--skp-border);border-radius:999px;background:transparent;color:var(--skp-text);font:inherit;font-size:12.5px;font-weight:500;line-height:18px;cursor:pointer;white-space:nowrap;transition:background-color .15s var(--skp-ease),color .15s var(--skp-ease),border-color .15s var(--skp-ease),opacity .15s var(--skp-ease);}
.skp-btn:hover:not(:disabled){background:var(--skp-hover);}
.skp-btn:focus-visible{outline:none;box-shadow:0 0 0 2px var(--skp-border-strong);}
.skp-btn:disabled{opacity:.4;cursor:default;}
.skp-btn-primary{background:var(--dsw-alias-button-primary-fill,var(--skp-text));border-color:transparent;color:var(--skp-on-accent);}
.skp-btn-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,#2a2f3a);color:var(--skp-on-accent);}
.skp-btn-danger-ghost{border-color:transparent;color:var(--skp-error);}
.skp-btn-danger-ghost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger,color-mix(in srgb,var(--skp-error) 8%,transparent));color:var(--skp-error);}
.skp-btn-danger{background:var(--skp-error);border-color:transparent;color:#fff;}
.skp-btn-danger:hover:not(:disabled){background:var(--skp-error);color:#fff;filter:brightness(.94);}
.skp-subheader .skp-btn{height:32px;padding:0 14px;font-size:13px;}
.skp-form .skp-btn,.skp-modal-actions .skp-btn{height:32px;padding:0 14px;font-size:13px;}
.skp-dot{display:inline-block;flex:none;width:9px;height:9px;border-radius:50%;margin-right:9px;background:var(--dsw-alias-border-l2,rgba(20,28,40,.2));}
.skp-dot-mounted{background:var(--skp-success);box-shadow:0 0 0 3px color-mix(in srgb,var(--skp-success) 18%,transparent);}
.skp-dot-enabled{background:var(--skp-success);box-shadow:0 0 0 3px color-mix(in srgb,var(--skp-success) 18%,transparent);}
.skp-dot-failed{background:var(--skp-error);box-shadow:0 0 0 3px color-mix(in srgb,var(--skp-error) 16%,transparent);}
.skp-dot-conflict{background:var(--skp-warn);box-shadow:0 0 0 3px color-mix(in srgb,var(--skp-warn) 18%,transparent);}
.skp-dd{position:relative;display:inline-block;min-width:0;}
.skp-dd-scope{max-width:250px;}
.skp-dd-btn{display:inline-flex;align-items:center;gap:8px;width:100%;height:34px;padding:0 30px 0 12px;border:1px solid var(--skp-border);border-radius:var(--skp-radius-sm);font:inherit;font-size:13px;background:var(--skp-surface) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238b95a1' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") no-repeat right 10px center/12px 12px;color:var(--skp-text-2);cursor:pointer;outline:none;text-align:left;transition:border-color .15s var(--skp-ease),box-shadow .15s var(--skp-ease),color .15s var(--skp-ease);}
.skp-dd-btn:hover:not(:disabled){border-color:var(--skp-border-strong);color:var(--skp-text);}
.skp-dd-btn:focus-visible{border-color:var(--skp-border-strong);box-shadow:0 0 0 3px var(--dsw-alias-interactive-bg-active,rgba(20,28,40,.08));}
.skp-dd-btn:disabled{background:var(--skp-fill);color:var(--skp-text-3);cursor:default;}
.skp-dd-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.skp-dd-pop{position:fixed;z-index:120;padding:5px;border:1px solid var(--skp-border);border-radius:10px;background:var(--skp-surface);box-shadow:0 12px 32px rgba(15,20,30,.16),0 2px 8px rgba(15,20,30,.08);overflow:auto;scrollbar-width:thin;}
.skp-dd-opt{display:flex;align-items:center;gap:8px;width:100%;padding:9px 10px;border:none;border-radius:7px;background:none;font:inherit;font-size:13.5px;color:var(--skp-text-2);cursor:pointer;text-align:left;transition:background-color .12s var(--skp-ease),color .12s var(--skp-ease);}
.skp-dd-opt:hover:not(:disabled){background:var(--skp-hover);color:var(--skp-text);}
.skp-dd-opt-active{color:var(--skp-text);background:var(--dsw-alias-interactive-bg-active,rgba(20,28,40,.08));font-weight:500;}
.skp-dd-opt:disabled{opacity:.45;cursor:default;}
.skp-dd-opt-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.skp-dd-hint{margin-left:auto;flex:none;font-size:11.5px;color:var(--skp-text-3);}
.skp-dd-check{margin-left:auto;flex:none;font-size:12px;line-height:1;}
.skp-dd-hint+.skp-dd-check{margin-left:0;}
.skp-form{display:flex;flex-direction:column;gap:12px;}
.skp-form>.skp-tabs{align-self:stretch;}
.skp-field{display:flex;flex-direction:column;gap:5px;}
.skp-field .skp-dd{display:block;width:100%;}
.skp-field .skp-dd-btn{height:36px;font-size:13.5px;}
.skp-field-inline{flex-direction:row;align-items:center;gap:8px;font-size:13.5px;color:var(--skp-text-2);}
.skp-field-inline input[type="checkbox"]{width:15px;height:15px;margin:0;accent-color:var(--dsw-alias-brand-primary,var(--skp-text));cursor:pointer;}
.skp-field-label{font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--skp-text-3);}
.skp-input{width:100%;padding:8px 12px;border:1px solid var(--skp-border);border-radius:var(--skp-radius-sm);font:inherit;font-size:13.5px;background:var(--skp-surface);color:var(--skp-text);outline:none;transition:border-color .15s var(--skp-ease),box-shadow .15s var(--skp-ease);}
.skp-input:focus-visible{border-color:var(--skp-border-strong);box-shadow:0 0 0 3px var(--dsw-alias-interactive-bg-active,rgba(20,28,40,.08));}
.skp-input:disabled{background:var(--skp-fill);color:var(--skp-text-3);}
.skp-textarea{min-height:72px;resize:vertical;font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:13px;line-height:1.5;}
.skp-subheader-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.skp-note{font-size:13px;color:var(--skp-text-3);word-break:break-all;}
.skp-modal-overlay{position:fixed;z-index:95;inset:0;background:var(--skp-mask);display:grid;place-items:center;}
.skp-modal{width:520px;max-width:92vw;max-height:84vh;overflow:auto;display:flex;flex-direction:column;gap:16px;padding:22px;border:1px solid var(--skp-border);border-radius:14px;background:var(--skp-surface);box-shadow:0 24px 64px rgba(15,20,30,.22),0 4px 16px rgba(15,20,30,.1);scrollbar-width:thin;}
.skp-modal h3{margin:0;font-size:16px;font-weight:600;color:var(--skp-text);}
.skp-modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:6px;}
.skp-json-field{min-height:150px;font-size:12.5px;line-height:1.6;}
.skp-import-list{margin:0;padding:8px;list-style:none;display:flex;flex-direction:column;gap:6px;max-height:200px;overflow:auto;border:1px solid var(--skp-border);border-radius:var(--skp-radius-sm);scrollbar-width:thin;}
.skp-import-item{display:flex;align-items:center;gap:8px;min-width:0;}
.skp-import-name{flex:none;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:600;color:var(--skp-text);}
.skp-import-desc{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px;color:var(--skp-text-3);}
.skp-import-note{margin-left:10px;flex:none;font-size:12px;color:var(--skp-text-3);}
.skp-import-note-add{color:var(--skp-success);}
.skp-import-note-over{color:var(--skp-warn);}
.skp-import-note-skip{color:var(--skp-text-3);}
.skp-composer-tools{display:inline-flex;align-items:center;gap:6px;padding:0 4px;border-radius:999px;background:var(--dsw-alias-bg-module-platform,rgba(20,28,40,.04));}
.skp-composer-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:none;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary,#5b6472);cursor:pointer;transition:color .15s ease,background-color .15s ease;}
.skp-composer-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(20,28,40,.05));}
.skp-composer-btn svg{display:block;}
.skp-composer-btn-open{color:var(--dsw-alias-brand-primary,#4176e6);background:var(--dsw-alias-interactive-bg-active,rgba(20,28,40,.08));}
.skp-composer-btn-active{color:var(--dsw-alias-state-success-primary,#189a52);}
.skp-composer-pop{position:absolute;bottom:calc(100% + 8px);left:0;z-index:119;width:280px;min-width:min(260px,100%);max-height:320px;display:flex;flex-direction:column;padding:4px;border:1px solid var(--dsw-alias-border-inverted,rgba(20,28,40,.1));border-radius:12px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-overlay,#fff));box-shadow:var(--dsw-shadow-lv3,0 12px 32px rgba(15,20,30,.16),0 2px 8px rgba(15,20,30,.08));font:14px/22px var(--dsw-font-family,system-ui,sans-serif);color:var(--dsw-alias-label-primary,#1b1f26);overflow:hidden;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2,rgba(0,0,0,.18));--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2,rgba(0,0,0,.28));}
.skp-composer-pop *{box-sizing:border-box;}
.skp-composer-head{flex:none;display:flex;align-items:center;min-height:26px;padding:6px 10px 2px;}
.skp-composer-title{flex:1;font-size:12px;font-weight:500;line-height:18px;color:var(--dsw-alias-label-tertiary,#8a93a3);}
.skp-composer-body{min-height:0;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-scrollbar-bg-l2,rgba(0,0,0,.18)) transparent;}
.skp-composer-group{min-height:26px;padding:6px 10px 2px;font-size:12px;font-weight:500;line-height:18px;color:var(--dsw-alias-label-tertiary,#8a93a3);}
.skp-composer-group:not(:first-child){margin-top:4px;}
.skp-composer-row{display:flex;align-items:center;gap:8px;min-height:40px;padding:8px 10px;border-radius:10px;font-size:14px;line-height:22px;}
.skp-composer-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(20,28,40,.05));}
.skp-composer-dot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-border-l2,rgba(20,28,40,.16));}
.skp-composer-dot-mounted{background:var(--dsw-alias-state-success-primary,#189a52);}
.skp-composer-dot-failed{background:var(--dsw-alias-state-error-primary,#d64545);}
.skp-composer-dot-conflict{background:var(--dsw-alias-state-warn-primary,#c26a0a);}
.skp-composer-name{flex:1;min-width:0;font-size:14px;color:var(--dsw-alias-label-primary,#1b1f26);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.skp-switch{position:relative;flex:none;width:30px;height:18px;}
.skp-switch input{position:absolute;inset:0;z-index:1;margin:0;opacity:0;cursor:pointer;}
.skp-switch-track{position:absolute;inset:0;border-radius:999px;background:var(--dsw-alias-border-l2,rgba(20,28,40,.16));transition:background-color .15s ease;}
.skp-switch-track::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 1px 2px rgba(15,20,30,.2);transition:transform .15s ease;}
.skp-switch input:checked + .skp-switch-track{background:var(--dsw-alias-brand-primary,#4176e6);}
.skp-switch input:checked + .skp-switch-track::after{transform:translateX(12px);}
.skp-switch input:disabled{cursor:default;}
.skp-switch input:disabled + .skp-switch-track{opacity:.45;}
.skp-composer-empty{padding:12px 10px 14px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-dimmed,#9aa3b2);}
.skp-composer-empty code{font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:11px;background:var(--dsw-alias-interactive-bg-hover,rgba(20,28,40,.05));border-radius:4px;padding:1px 4px;}
.skp-composer-banner{margin:2px 6px 4px;padding:6px 8px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#d64545) 8%,transparent);color:var(--dsw-alias-state-error-primary,#d64545);font-size:12px;line-height:18px;white-space:pre-wrap;}
.skp-composer-pop-skills{width:340px;}
.skp-composer-pop-quick{width:340px;}
.skp-composer-search{flex:none;width:calc(100% - 8px);height:30px;margin:2px 4px 4px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2,rgba(20,28,40,.08));border-radius:8px;background:transparent;font:inherit;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary,#1b1f26);outline:none;transition:border-color .15s ease;}
.skp-composer-search::placeholder{color:var(--dsw-alias-label-dimmed,#9aa3b2);}
.skp-composer-search:focus-visible{border-color:var(--dsw-alias-border-l3,rgba(20,28,40,.16));}
.skp-composer-search::-webkit-search-cancel-button{cursor:pointer;}
.skp-composer-skill{display:flex;align-items:center;gap:8px;width:100%;min-height:40px;padding:8px 10px;border:none;border-radius:10px;background:none;font:inherit;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary,#1b1f26);text-align:left;cursor:pointer;transition:background-color .12s ease;}
.skp-composer-skill:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(20,28,40,.05));}
.skp-composer-skill:disabled{opacity:.45;cursor:default;}
.skp-composer-skill-name{flex:none;max-width:40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.skp-composer-skill-desc{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary,#8a93a3);}
.skp-composer-quick-row{display:flex;align-items:center;border-radius:10px;}
.skp-composer-quick-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(20,28,40,.05));}
.skp-composer-quick-pick{flex:1;min-width:0;display:flex;align-items:center;gap:8px;min-height:40px;padding:8px 6px 8px 10px;border:none;border-radius:10px;background:none;font:inherit;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary,#1b1f26);text-align:left;cursor:pointer;transition:background-color .12s ease;}
.skp-composer-quick-pick:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(20,28,40,.05));}
.skp-composer-quick-pick:disabled{opacity:.45;cursor:default;}
.skp-composer-quick-send{flex:none;display:grid;place-items:center;width:28px;height:28px;margin:0 4px 0 0;padding:0;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#5b6472);cursor:pointer;opacity:0;pointer-events:none;transition:opacity .12s ease,background-color .12s ease;}
.skp-composer-quick-row:hover .skp-composer-quick-send,.skp-composer-quick-row:focus-within .skp-composer-quick-send{opacity:1;pointer-events:auto;}
.skp-composer-quick-send:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(20,28,40,.05));}
.skp-composer-quick-send:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-border-l3,rgba(20,28,40,.16));}
.skp-composer-quick-send svg{display:block;}
`;
		/**
		* 注入样式表（幂等：已存在同 id 的 style 标签则不重复注入）。
		* 返回清理函数，用于插件 stop / 卸载时移除标签。
		*/
		function installStyles() {
			const id = "dsh-capability-panel-css";
			if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${id}"]`) === null) {
				const tag = document.createElement("style");
				tag.dataset.plugin = "@chengdb/capability-panel";
				tag.dataset.pluginCss = id;
				tag.textContent = SKP_CSS;
				document.head.appendChild(tag);
				return () => tag.remove();
			}
			return () => void 0;
		}
		//#endregion
		//#region src/mcp/entry-util.ts
		/**
		* 归类条目的传输方式：显式 `type` 优先；`url` 存在且无 command 视为 http。
		* 扩展的 `"sse"` 也归类为 http（桥接层统一走 streamable-http）。
		*/
		function transportOf(entry) {
			if (entry.type === "http" || entry.type === "sse") return "http";
			if (entry.type === "stdio") return "stdio";
			return typeof entry.url === "string" && entry.url.length > 0 && entry.command === void 0 ? "http" : "stdio";
		}
		/** 生成面板列表用的一行摘要：http 显示 URL，stdio 显示"命令 参数"。 */
		function summarizeEntry(entry) {
			if (transportOf(entry) === "http") return entry.url ?? "(missing url)";
			const args = (entry.args ?? []).join(" ");
			return [entry.command ?? "(missing command)", args].filter((part) => part.length > 0).join(" ");
		}
		/**
		* 校验面板提交的条目，返回问题列表；空列表表示可挂载。
		*
		* 检查项：键名非空且 ≤ 64 字符；stdio 必须有 command、args 必须是字符串数组；
		* http 必须有 url；env / headers 必须是"字符串值"的对象；timeoutMs 必须是正数。
		*/
		function validateEntry(key, entry) {
			const errors = [];
			if (key.trim().length === 0) errors.push("name must not be empty");
			if (key.length > 64) errors.push("name must be at most 64 characters");
			if (transportOf(entry) === "stdio") {
				if (typeof entry.command !== "string" || entry.command.trim().length === 0) errors.push("stdio server requires \"command\"");
				if (entry.args !== void 0 && !Array.isArray(entry.args)) errors.push("\"args\" must be an array of strings");
			} else if (typeof entry.url !== "string" || entry.url.trim().length === 0) errors.push("http server requires \"url\"");
			for (const [field, record] of [["env", entry.env], ["headers", entry.headers]]) {
				if (record === void 0) continue;
				if (record === null || typeof record !== "object" || Array.isArray(record)) {
					errors.push(`"${field}" must be an object of string values`);
					continue;
				}
				for (const [k, v] of Object.entries(record)) if (typeof v !== "string") errors.push(`"${field}.${k}" must be a string`);
			}
			if (entry.timeoutMs !== void 0 && (!Number.isFinite(entry.timeoutMs) || entry.timeoutMs <= 0)) errors.push("\"timeoutMs\" must be a positive number");
			return errors;
		}
		//#endregion
		//#region src/client/modal.tsx
		/** 模态框外壳：标题 + 内容；点遮罩关闭（内容区点击已拦截）。 */
		function Modal({ title, children, onClose }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "skp-modal-overlay",
				onClick: onClose,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "skp-modal",
					role: "dialog",
					"aria-label": title,
					onClick: (e) => e.stopPropagation(),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: title }), children]
				})
			});
		}
		//#endregion
		//#region src/client/select.tsx
		/**
		* 自绘下拉框（替代原生 <select>——原生的选项列表由浏览器渲染，
		* 无法定制样式，视觉与面板其余部分不一致）。
		*
		* 结构：触发按钮（.skp-dd-btn，带雪佛龙箭头）+ fixed 定位的弹出列表
		* （.skp-dd-pop）。弹出层用 getBoundingClientRect 锚定到按钮下方，
		* 因此不受父级 overflow:auto（如模态框）裁剪；列表项支持禁用、右侧
		* hint 与选中对勾。
		*
		* 关闭时机：点击组件外部（capture 阶段判定）、Esc、窗口滚动 / resize。
		*
		* @module @chengdb/capability-panel/client/select
		*/
		/**
		* 扁平风格下拉框。
		*
		* `className` 追加在根节点上（如头部作用域选择器的 `skp-dd-scope`
		* 限宽；表单字段内由 `.skp-field .skp-dd` 撑满整行）。
		*/
		function SkpSelect({ value, options, onChange, disabled, ariaLabel, title, className }) {
			const [anchor, setAnchor] = (0, react.useState)(null);
			const rootRef = (0, react.useRef)(null);
			const btnRef = (0, react.useRef)(null);
			const open = anchor !== null;
			const selected = options.find((option) => option.value === value);
			(0, react.useEffect)(() => {
				if (!open) return;
				const close = () => setAnchor(null);
				const onPointerDown = (event) => {
					if (rootRef.current !== null && event.target instanceof Node && !rootRef.current.contains(event.target)) close();
				};
				const onKeyDown = (event) => {
					if (event.key === "Escape") close();
				};
				document.addEventListener("pointerdown", onPointerDown, true);
				document.addEventListener("keydown", onKeyDown);
				window.addEventListener("resize", close);
				window.addEventListener("scroll", close, true);
				return () => {
					document.removeEventListener("pointerdown", onPointerDown, true);
					document.removeEventListener("keydown", onKeyDown);
					window.removeEventListener("resize", close);
					window.removeEventListener("scroll", close, true);
				};
			}, [open]);
			/** 打开时按按钮视口位置锚定弹出层；视口底部留 12px 余量。 */
			const toggle = () => {
				if (disabled === true) return;
				if (open) {
					setAnchor(null);
					return;
				}
				const rect = btnRef.current?.getBoundingClientRect();
				if (rect === void 0) return;
				setAnchor({
					left: rect.left,
					top: rect.bottom + 6,
					width: Math.max(rect.width, 200),
					maxHeight: Math.max(160, window.innerHeight - rect.bottom - 18)
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: rootRef,
				className: className === void 0 ? "skp-dd" : `skp-dd ${className}`,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					ref: btnRef,
					type: "button",
					className: "skp-dd-btn",
					disabled,
					"aria-haspopup": "listbox",
					"aria-expanded": open,
					"aria-label": ariaLabel,
					title,
					onClick: toggle,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "skp-dd-label",
						children: selected?.label ?? value
					})
				}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "skp-dd-pop",
					role: "listbox",
					style: {
						left: anchor.left,
						top: anchor.top,
						minWidth: anchor.width,
						maxHeight: anchor.maxHeight
					},
					children: options.map((option) => {
						const active = option.value === value;
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							role: "option",
							"aria-selected": active,
							className: active ? "skp-dd-opt skp-dd-opt-active" : "skp-dd-opt",
							disabled: option.disabled,
							onClick: () => {
								onChange(option.value);
								setAnchor(null);
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "skp-dd-opt-label",
									children: option.label
								}),
								option.hint !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "skp-dd-hint",
									children: option.hint
								}),
								active && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "skp-dd-check",
									"aria-hidden": "true",
									children: "✓"
								})
							]
						}, option.value);
					})
				})]
			});
		}
		//#endregion
		//#region src/client/scope-tabs.ts
		/** 每个 Tab 的展示文案（当前为硬编码中文，见 client.ts 的 locale 说明）。 */
		const SCOPE_LABEL = {
			all: "全部",
			project: "项目",
			global: "全局"
		};
		//#endregion
		//#region src/client/mcp-panel.tsx
		/**
		* Capability Panel 的 MCP 域视图。
		*
		* 列出合并后的 server 配置（全局 `~/.dsh/mcp.json` + 项目 `.mcp.json`，
		* 同名键项目遮蔽全局），叠加每个 session 的实时挂载状态，并按
		* All / Project / Global 作用域 Tab（见 scope-tabs.ts）+ 搜索过滤；
		* 支持 新增 / 编辑 / 删除 / 启用禁用。写入直接落配置文件，宿主在每次
		* 写操作后重挂受影响 session 的连接。
		*
		* @module @chengdb/capability-panel/client/mcp-panel
		*/
		/** 复合行 id：同一个 key 可能同时存在于 project 与 global 两个作用域。 */
		function rowId$2(server) {
			return `${server.scope}:${server.key}`;
		}
		/** 挂载状态的展示文案。 */
		const MOUNT_LABEL$1 = {
			mounted: "已挂载",
			failed: "挂载失败",
			conflict: "名称冲突（已被其他会话挂载）"
		};
		/**
		* MCP 视图主组件：状态管理 + 拉取/重拉 + 列表 + 详情/表单。
		*/
		function McpView({ api, workspace }) {
			const [servers, setServers] = (0, react.useState)([]);
			const [listErrors, setListErrors] = (0, react.useState)([]);
			const [mounts, setMounts] = (0, react.useState)({});
			const [loading, setLoading] = (0, react.useState)(true);
			const [opError, setOpError] = (0, react.useState)(void 0);
			const [tab, setTab] = (0, react.useState)("all");
			const [query, setQuery] = (0, react.useState)("");
			const [selected, setSelected] = (0, react.useState)(void 0);
			const [editServer, setEditServer] = (0, react.useState)(void 0);
			const [addOpen, setAddOpen] = (0, react.useState)(false);
			const [confirmDelete, setConfirmDelete] = (0, react.useState)(void 0);
			/**
			* 重新拉取：list + status 并行。挂载状态按 server.key 聚合，
			* 多个 session 同名 server 取"最差"状态（conflict > failed > mounted），
			* 数字越大代表越需要关注。
			*/
			const reload = () => {
				let cancelled = false;
				setLoading(true);
				setOpError(void 0);
				Promise.all([api.list(), api.status().catch(() => [])]).then(([list, statuses]) => {
					if (cancelled) return;
					setServers(list.servers);
					setListErrors(list.errors);
					const byKey = {};
					const rank = (state) => state === "conflict" ? 2 : state === "failed" ? 1 : 0;
					for (const status of statuses) for (const mount of status.servers) {
						const prev = byKey[mount.key];
						const next = {
							state: mount.state,
							...mount.error !== void 0 ? { error: mount.error } : {}
						};
						if (prev === void 0 || rank(next.state) > rank(prev.state)) byKey[mount.key] = next;
					}
					setMounts(byKey);
				}).catch((err) => {
					if (!cancelled) setOpError(String(err));
				}).finally(() => {
					if (!cancelled) setLoading(false);
				});
				return () => {
					cancelled = true;
				};
			};
			(0, react.useEffect)(reload, [api, workspace]);
			const visible = (0, react.useMemo)(() => {
				const q = query.trim().toLowerCase();
				return servers.filter((server) => {
					const inScope = tab === "all" || server.scope === tab;
					const inQuery = q.length === 0 || server.key.toLowerCase().includes(q) || server.summary.toLowerCase().includes(q);
					return inScope && inQuery;
				});
			}, [
				servers,
				tab,
				query
			]);
			const selectedServer = servers.find((s) => rowId$2(s) === selected);
			/** 执行一次写操作：失败写 opError；成功清错误并重拉列表。返回是否成功。 */
			const runOp = async (op) => {
				const result = await op;
				if (!result.ok) {
					setOpError(result.errors.join("; "));
					return false;
				}
				setOpError(void 0);
				reload();
				return true;
			};
			/** 启用/禁用切换（直接写入配置文件，落盘后宿主自动重挂）。 */
			const onToggle = (server) => {
				runOp(api.setEnabled({
					scope: server.scope,
					key: server.key,
					enabled: !server.enabled
				}));
			};
			/** 删除：第一次点击进入确认态；同一行再次点击才真正删除并清空选中。 */
			const onDelete = (server) => {
				const id = rowId$2(server);
				if (confirmDelete !== id) {
					setConfirmDelete(id);
					return;
				}
				setConfirmDelete(void 0);
				runOp(api.remove({
					scope: server.scope,
					key: server.key
				})).then((ok) => {
					if (ok) setSelected(void 0);
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "skp-domain",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "skp-subheader",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "skp-tabs",
								role: "tablist",
								children: [
									"all",
									"project",
									"global"
								].map((t) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									role: "tab",
									"aria-selected": tab === t,
									className: tab === t ? "skp-tab skp-tab-active" : "skp-tab",
									onClick: () => setTab(t),
									children: SCOPE_LABEL[t]
								}, t))
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: "skp-search",
								type: "search",
								placeholder: "搜索 MCP 服务器…",
								value: query,
								onChange: (e) => setQuery(e.target.value)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "skp-btn skp-btn-primary",
								onClick: () => {
									setEditServer(void 0);
									setSelected(void 0);
									setAddOpen(true);
								},
								children: "+ 添加服务器"
							})
						]
					}),
					listErrors.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "skp-error",
						children: listErrors.join("\n")
					}),
					opError && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "skp-error",
						children: opError
					}),
					loading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "skp-status",
						children: "加载中…"
					}),
					!loading && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "skp-body",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("ul", {
							className: "skp-list",
							children: [visible.map((server) => {
								const id = rowId$2(server);
								const mount = mounts[server.key];
								return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									className: selected === id ? "skp-row skp-row-active" : "skp-row",
									onClick: () => {
										setSelected(id);
										setEditServer(void 0);
										setConfirmDelete(void 0);
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: "skp-row-name",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: `skp-dot skp-dot-${mount?.state ?? "none"}`,
												title: mount === void 0 ? "未挂载到当前会话" : MOUNT_LABEL$1[mount.state]
											}), server.key]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: "skp-row-meta",
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: server.scope === "project" ? "skp-tag skp-tag-project" : "skp-tag skp-tag-global",
													children: server.scope === "project" ? "项目" : "全局"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "skp-tag skp-tag-flat",
													children: server.transport
												}),
												!server.enabled && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "skp-tag skp-tag-readonly",
													children: "已禁用"
												}),
												server.shadowed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "skp-tag skp-tag-directory",
													children: "被遮蔽"
												})
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "skp-row-desc",
											children: server.summary
										})
									]
								}) }, id);
							}), visible.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", {
								className: "skp-empty",
								children: "没有匹配的 MCP 服务器。"
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "skp-detail",
							children: selectedServer ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(McpDetail, {
								server: selectedServer,
								mount: mounts[selectedServer.key],
								confirming: confirmDelete === rowId$2(selectedServer),
								onEdit: () => setEditServer(selectedServer),
								onToggle: () => onToggle(selectedServer),
								onDelete: () => onDelete(selectedServer)
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "skp-detail-empty",
								children: "选择一个服务器查看详情，或新增一个。"
							})
						})]
					}),
					addOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(McpAddDialog, {
						api,
						servers,
						workspace,
						onClose: () => setAddOpen(false),
						onMutated: () => reload()
					}),
					editServer !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(McpEditDialog, {
						api,
						server: editServer,
						workspace,
						onClose: () => setEditServer(void 0),
						onSaved: () => reload()
					})
				]
			});
		}
		/** 详情卡片：只读展示条目字段 + 挂载状态 + 编辑/启停/删除操作。 */
		function McpDetail({ server, mount, confirming, onEdit, onToggle, onDelete }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "skp-detail-card",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "skp-detail-head",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: server.key }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "skp-detail-actions",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "skp-detail-enable",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "skp-switch",
									title: server.enabled ? "点击禁用（保留在配置文件中，不挂载）" : "点击启用（写入配置文件并挂载）",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										checked: server.enabled,
										onChange: onToggle
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "skp-switch-track" })]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "skp-detail-enable-label",
									children: server.enabled ? "已启用" : "已禁用"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "skp-btn",
								onClick: onEdit,
								children: "编辑"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: confirming ? "skp-btn skp-btn-danger" : "skp-btn skp-btn-danger-ghost",
								onClick: onDelete,
								children: confirming ? "确认删除？" : "删除"
							})
						]
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
					className: "skp-detail-fields",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "命名空间" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dd", { children: [
							"mcp__",
							server.serverName,
							"__*"
						] }),
						server.transport === "stdio" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "命令" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
								className: "skp-path",
								children: server.entry.command
							}),
							(server.entry.args ?? []).length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "参数" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
								className: "skp-path",
								children: (server.entry.args ?? []).join(" ")
							})] })
						] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "URL" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
							className: "skp-path",
							children: server.entry.url
						})] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "作用域" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dd", { children: [server.scope === "project" ? "项目" : "全局", server.shadowed ? "（被项目级同名条目遮蔽）" : ""] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "配置文件" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
							className: "skp-path",
							children: server.filePath
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "状态" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: mount === void 0 ? "未挂载到当前会话" : MOUNT_LABEL$1[mount.state] }),
						mount?.error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "错误" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
							className: "skp-path",
							children: mount.error
						})] })
					]
				})]
			});
		}
		/**
		* 新增 / 编辑表单（分别内嵌在添加 / 编辑弹窗里，见 McpAddDialog / McpEditDialog）。
		*
		* 多行文本框承载 env / headers（每行 `KEY=VALUE`）与 args（每行一个参数），
		* 提交时解析成结构化字段；新增时 scope 与 name 可改（编辑改名 = 删除后重建，
		* 这里用禁用态规避）。
		*
		* `embedded` 为 true 时褪掉卡片外壳与自带标题，直接作为弹窗内容；
		* 此时按钮行由 `actionsClass` 指定落到弹窗底部的对齐方式。
		* onSave 抛错（如宿主校验/落盘失败）时把错误信息展示在表单顶部。
		*/
		function McpForm({ mode, server, workspace, embedded, actionsClass = "skp-detail-actions", onCancel, onSave }) {
			const entry = server?.entry ?? {};
			const [scope, setScope] = (0, react.useState)(server?.scope ?? (workspace !== void 0 ? "project" : "global"));
			const [key, setKey] = (0, react.useState)(server?.key ?? "");
			const [transport, setTransport] = (0, react.useState)(server?.transport ?? "stdio");
			const [command, setCommand] = (0, react.useState)(entry.command ?? "");
			const [args, setArgs] = (0, react.useState)((entry.args ?? []).join("\n"));
			const [env, setEnv] = (0, react.useState)(recordToLines(entry.env));
			const [url, setUrl] = (0, react.useState)(entry.url ?? "");
			const [headers, setHeaders] = (0, react.useState)(recordToLines(entry.headers));
			const [timeoutMs, setTimeoutMs] = (0, react.useState)(entry.timeoutMs !== void 0 ? String(entry.timeoutMs) : "");
			const [disabled, setDisabled] = (0, react.useState)(entry.disabled === true);
			const [errors, setErrors] = (0, react.useState)([]);
			const [saving, setSaving] = (0, react.useState)(false);
			const isNew = mode === "new";
			const noWorkspace = workspace === void 0 || workspace === "（无工作区）";
			/** 客户端前置校验（与宿主的 validateEntry 保持同口径，快速反馈）。 */
			const submit = async () => {
				const problems = [];
				if (key.trim().length === 0) problems.push("名称不能为空");
				if (transport === "stdio" && command.trim().length === 0) problems.push("stdio 服务器需要填写「命令」");
				if (transport === "http" && url.trim().length === 0) problems.push("http 服务器需要填写「URL」");
				const envRecord = linesToRecord(env, "env", problems);
				const headerRecord = linesToRecord(headers, "headers", problems);
				const timeout = timeoutMs.trim().length === 0 ? void 0 : Number(timeoutMs);
				if (timeout !== void 0 && (!Number.isFinite(timeout) || timeout <= 0)) problems.push("超时必须是正数（ms）");
				if (problems.length > 0) {
					setErrors(problems);
					return;
				}
				const next = transport === "stdio" ? {
					type: "stdio",
					command: command.trim(),
					args: linesToArray(args),
					...Object.keys(envRecord).length > 0 ? { env: envRecord } : {},
					...timeout !== void 0 ? { timeoutMs: timeout } : {},
					...disabled ? { disabled: true } : {}
				} : {
					type: "http",
					url: url.trim(),
					...Object.keys(headerRecord).length > 0 ? { headers: headerRecord } : {},
					...timeout !== void 0 ? { timeoutMs: timeout } : {},
					...disabled ? { disabled: true } : {}
				};
				setSaving(true);
				try {
					await onSave(scope, key.trim(), next);
					setErrors([]);
				} catch (error) {
					setErrors([error instanceof Error ? error.message : String(error)]);
				} finally {
					setSaving(false);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: embedded ? void 0 : "skp-detail-card",
				children: [
					!embedded && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: isNew ? "添加 MCP 服务器" : `编辑 ${server?.key}` }),
					errors.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "skp-error",
						children: errors.join("\n")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "skp-form",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "skp-field",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "skp-field-label",
									children: "作用域"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkpSelect, {
									value: scope,
									disabled: !isNew,
									ariaLabel: "服务器作用域",
									options: [{
										value: "project",
										label: "项目（.mcp.json）",
										disabled: noWorkspace
									}, {
										value: "global",
										label: "全局（~/.dsh/mcp.json）"
									}],
									onChange: (value) => setScope(value === "project" ? "project" : "global")
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "skp-field",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "skp-field-label",
									children: "名称"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: "skp-input",
									value: key,
									disabled: !isNew,
									placeholder: "github",
									onChange: (e) => setKey(e.target.value)
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "skp-field",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "skp-field-label",
									children: "传输方式"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkpSelect, {
									value: transport,
									ariaLabel: "传输方式",
									options: [{
										value: "stdio",
										label: "stdio（启动本地命令）"
									}, {
										value: "http",
										label: "http（流式 HTTP 端点）"
									}],
									onChange: (value) => setTransport(value === "http" ? "http" : "stdio")
								})]
							}),
							transport === "stdio" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "skp-field",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "skp-field-label",
										children: "命令"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: "skp-input",
										value: command,
										placeholder: "npx",
										onChange: (e) => setCommand(e.target.value)
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "skp-field",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "skp-field-label",
										children: "参数（每行一个）"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
										className: "skp-input skp-textarea",
										value: args,
										placeholder: "-y\n@modelcontextprotocol/server-github",
										onChange: (e) => setArgs(e.target.value)
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "skp-field",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "skp-field-label",
										children: [
											"环境变量（每行 KEY=VALUE，支持 $",
											"${VAR}",
											"）"
										]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
										className: "skp-input skp-textarea",
										value: env,
										placeholder: "GITHUB_TOKEN=${GITHUB_TOKEN}",
										onChange: (e) => setEnv(e.target.value)
									})]
								})
							] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "skp-field",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "skp-field-label",
									children: "URL"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: "skp-input",
									value: url,
									placeholder: "http://localhost:3000/mcp",
									onChange: (e) => setUrl(e.target.value)
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "skp-field",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "skp-field-label",
									children: "请求头（每行 KEY=VALUE）"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
									className: "skp-input skp-textarea",
									value: headers,
									onChange: (e) => setHeaders(e.target.value)
								})]
							})] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "skp-field",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "skp-field-label",
									children: "工具调用超时（ms，可选）"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: "skp-input",
									value: timeoutMs,
									inputMode: "numeric",
									placeholder: "60000",
									onChange: (e) => setTimeoutMs(e.target.value)
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "skp-field skp-field-inline",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: disabled,
									onChange: (e) => setDisabled(e.target.checked)
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "禁用（保留在配置文件中，不挂载）" })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: actionsClass,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "skp-btn skp-btn-primary",
									disabled: saving,
									onClick: () => void submit(),
									children: saving ? isNew ? "添加中…" : "保存中…" : isNew ? "添加" : "保存"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "skp-btn",
									onClick: onCancel,
									children: "取消"
								})]
							})
						]
					})
				]
			});
		}
		/**
		* 添加 MCP 服务器弹窗：与技能安装弹窗同构（Modal + 模式 Tab）。
		*
		* - 表单：沿用 McpForm（embedded 内嵌）逐字段填写单个条目；
		* - JSON：粘贴 .mcp.json 或裸服务器映射，实时预览后批量添加。
		*/
		function McpAddDialog({ api, servers, workspace, onClose, onMutated }) {
			const [tab, setTab] = (0, react.useState)("form");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Modal, {
				title: "添加 MCP 服务器",
				onClose,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "skp-tabs",
						role: "tablist",
						children: ["form", "json"].map((t) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							role: "tab",
							"aria-selected": tab === t,
							className: tab === t ? "skp-tab skp-tab-active" : "skp-tab",
							onClick: () => setTab(t),
							children: t === "form" ? "表单" : "JSON"
						}, t))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						hidden: tab !== "form",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(McpForm, {
							mode: "new",
							workspace,
							embedded: true,
							actionsClass: "skp-modal-actions",
							onCancel: onClose,
							onSave: async (scope, key, entry) => {
								const result = await api.upsert({
									scope,
									key,
									entry
								});
								if (!result.ok) throw new Error(result.errors.join("; "));
								onMutated();
								onClose();
							}
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						hidden: tab !== "json",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(McpJsonImport, {
							api,
							servers,
							workspace,
							onClose,
							onMutated
						})
					})
				]
			});
		}
		/**
		* 编辑 MCP 服务器弹窗：与新增同款外壳（Modal + 内嵌 McpForm）。
		* 只含表单（JSON 批量导入只属于新增场景）；scope 与 name 在编辑态锁定
		* （改名 = 删除后重建，沿用 McpForm 的禁用态规避）。
		*/
		function McpEditDialog({ api, server, workspace, onClose, onSaved }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Modal, {
				title: `编辑 ${server.key}`,
				onClose,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(McpForm, {
					mode: "edit",
					server,
					workspace,
					embedded: true,
					actionsClass: "skp-modal-actions",
					onCancel: onClose,
					onSave: async (scope, key, entry) => {
						const result = await api.upsert({
							scope,
							key,
							entry
						});
						if (!result.ok) throw new Error(result.errors.join("; "));
						onSaved();
						onClose();
					}
				})
			});
		}
		/**
		* 解析"添加 MCP 服务器"的 JSON 文本为条目清单。
		*
		* 接受两种形状：
		*   - 完整配置文件：`{ "mcpServers": { … } }`（可直接粘贴 .mcp.json）；
		*   - 裸映射：`{ "github": { … }, "web": { … } }`。
		* 顶层必须是对象；逐条用与宿主同口径的 validateEntry 校验
		* （见 mcp/entry-util.ts），任一非法条目都会整体返回错误与逐条原因。
		*/
		function parseMcpJson(text) {
			let data;
			try {
				data = JSON.parse(text);
			} catch (error) {
				return {
					ok: false,
					errors: [`JSON 解析失败：${error instanceof Error ? error.message : String(error)}`]
				};
			}
			if (data === null || typeof data !== "object" || Array.isArray(data)) return {
				ok: false,
				errors: ["JSON 顶层必须是对象，例如 { \"mcpServers\": { … } } 或 { \"服务器名\": { … } }"]
			};
			const root = data;
			if (Object.keys(root).length > 0 && Object.values(root).every((v) => v === null || typeof v !== "object" || Array.isArray(v))) return {
				ok: false,
				errors: ["看起来是单条服务器条目，缺少名称键；请用 { \"服务器名\": { … } } 包裹。"]
			};
			let servers;
			if (typeof root.mcpServers === "object" && root.mcpServers !== null && !Array.isArray(root.mcpServers)) servers = root.mcpServers;
			else if ("mcpServers" in root && Object.keys(root).length === 1) return {
				ok: false,
				errors: ["「mcpServers」必须是服务器对象映射。"]
			};
			else servers = root;
			const entries = [];
			const problems = [];
			for (const [key, value] of Object.entries(servers)) {
				if (value === null || typeof value !== "object" || Array.isArray(value)) {
					problems.push(`${key}: 条目必须是对象`);
					continue;
				}
				const entry = value;
				const entryProblems = validateEntry(key, entry);
				if (entryProblems.length > 0) {
					problems.push(`${key}: ${entryProblems.join("; ")}`);
					continue;
				}
				entries.push({
					key,
					entry
				});
			}
			if (problems.length > 0) return {
				ok: false,
				errors: problems
			};
			if (entries.length === 0) return {
				ok: false,
				errors: ["没有可添加的服务器条目。"]
			};
			return {
				ok: true,
				entries
			};
		}
		/** JSON 文本框占位示例（两种形状都能贴）。 */
		const JSON_PLACEHOLDER = `{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "\${GITHUB_TOKEN}" }
    },
    "web": { "type": "http", "url": "http://localhost:3000/mcp" }
  }
}`;
		/**
		* JSON 批量添加面板：粘贴 .mcp.json 或裸服务器映射，实时解析并预览
		* （新增 / 覆盖 / 跳过与逐条错误），确认后逐条写入。
		*
		* 逐条**串行** upsert：并发读写同一配置文件会互相覆盖（读-改-写竞态），
		* 串行保证每次写入都基于最新文件内容。
		*/
		function McpJsonImport({ api, servers, workspace, onClose, onMutated }) {
			const noWorkspace = workspace === void 0 || workspace === "（无工作区）";
			const [text, setText] = (0, react.useState)("");
			const [scope, setScope] = (0, react.useState)(noWorkspace ? "global" : "project");
			const [overwrite, setOverwrite] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [opErrors, setOpErrors] = (0, react.useState)([]);
			const parse = (0, react.useMemo)(() => parseMcpJson(text), [text]);
			const preview = (0, react.useMemo)(() => {
				if (!parse.ok) return void 0;
				return parse.entries.map(({ key, entry }) => {
					const exists = servers.some((s) => s.scope === scope && s.key === key);
					return {
						key,
						entry,
						exists,
						overwriting: exists && overwrite,
						skipped: exists && !overwrite
					};
				});
			}, [
				parse,
				servers,
				scope,
				overwrite
			]);
			const addable = preview?.filter((item) => !item.skipped) ?? [];
			const doAdd = async () => {
				setBusy(true);
				setOpErrors([]);
				const failures = [];
				let added = 0;
				for (const { key, entry } of addable) {
					const result = await api.upsert({
						scope,
						key,
						entry
					});
					if (result.ok) added += 1;
					else failures.push(`${key}: ${result.errors.join("; ")}`);
				}
				onMutated();
				if (failures.length > 0) {
					setOpErrors([`已添加 ${added} 个，失败 ${failures.length} 个：`, ...failures]);
					setBusy(false);
					return;
				}
				onClose();
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "skp-form",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "skp-field",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "skp-field-label",
								children: "JSON 配置"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								className: "skp-input skp-textarea skp-json-field",
								value: text,
								spellCheck: false,
								placeholder: JSON_PLACEHOLDER,
								onChange: (e) => {
									setText(e.target.value);
									setOpErrors([]);
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "skp-note",
								children: [
									"支持完整 .mcp.json（含 mcpServers 键），或直接粘贴 ",
									`{ "服务器名": { … } }`,
									" 映射。"
								]
							})
						]
					}),
					!parse.ok && text.trim().length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "skp-error",
						children: parse.errors.join("\n")
					}),
					preview !== void 0 && preview.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "skp-field",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "skp-field-label",
							children: [
								"将添加 ",
								addable.length,
								"/",
								preview.length,
								" 个"
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
							className: "skp-import-list",
							children: preview.map(({ key, entry, overwriting, skipped }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
								className: "skp-import-item",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "skp-import-name",
										children: key
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "skp-tag skp-tag-flat",
										children: transportOf(entry)
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "skp-import-desc",
										children: summarizeEntry(entry)
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: `skp-import-note ${overwriting ? "skp-import-note-over" : skipped ? "skp-import-note-skip" : "skp-import-note-add"}`,
										children: overwriting ? "将覆盖" : skipped ? "已存在，跳过" : "将新增"
									})
								]
							}, key))
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "skp-field",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "skp-field-label",
							children: "添加到"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkpSelect, {
							value: scope,
							ariaLabel: "添加目标作用域",
							options: [{
								value: "project",
								label: "项目（.mcp.json）",
								disabled: noWorkspace
							}, {
								value: "global",
								label: "全局（~/.dsh/mcp.json）"
							}],
							onChange: (value) => setScope(value === "project" ? "project" : "global")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "skp-field skp-field-inline",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: overwrite,
							onChange: (e) => setOverwrite(e.target.checked)
						}), "同名服务器已存在时覆盖"]
					}),
					opErrors.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "skp-error",
						children: opErrors.join("\n")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "skp-modal-actions",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "skp-btn",
							onClick: onClose,
							children: "取消"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "skp-btn skp-btn-primary",
							disabled: busy || addable.length === 0,
							onClick: () => void doAdd(),
							children: busy ? "添加中…" : `添加 ${addable.length} 个`
						})]
					})
				]
			});
		}
		/** 记录 → 每行 `KEY=VALUE` 的文本（多行文本框回填用）。 */
		function recordToLines(record) {
			return Object.entries(record ?? {}).map(([k, v]) => `${k}=${v}`).join("\n");
		}
		/** 文本 → 记录；非法行（不以 `KEY=` 开头）记入 problems 并跳过。 */
		function linesToRecord(text, field, problems) {
			const out = {};
			for (const rawLine of text.split("\n")) {
				const line = rawLine.trim();
				if (line.length === 0) continue;
				const eq = line.indexOf("=");
				if (eq <= 0) {
					problems.push(`${field}：行「${line}」不是 KEY=VALUE 格式`);
					continue;
				}
				out[line.slice(0, eq).trim()] = line.slice(eq + 1);
			}
			return out;
		}
		/** 文本 → 参数数组：按行拆分、trim、跳过空行。 */
		function linesToArray(text) {
			return text.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
		}
		//#endregion
		//#region src/quick-messages/entry-util.ts
		/**
		* 快捷消息的纯函数工具（无 Node 依赖，宿主与浏览器端通用）。
		*
		* 名称/正文校验同时被宿主（写入前校验，见 config-file.ts）与浏览器端
		* （「新增/编辑快捷消息」弹窗的前置校验）使用，独立成模块避免两侧口径漂移。
		*
		* @module @chengdb/capability-panel/quick-messages/entry-util
		*/
		/** 名称允许的最大长度。 */
		const MAX_NAME_LENGTH = 64;
		/**
		* 校验一条快捷消息的名称与正文（宿主与客户端共用的最小口径）。
		*
		* @returns 错误信息列表；空数组表示通过
		*/
		function validateQuickMessage(name, text) {
			const errors = [];
			const trimmedName = name.trim();
			if (trimmedName.length === 0) errors.push("快捷消息名称不能为空");
			else if (trimmedName.length > MAX_NAME_LENGTH) errors.push(`快捷消息名称不能超过 ${MAX_NAME_LENGTH} 个字符`);
			else if (trimmedName === "__proto__") errors.push("快捷消息名称不能为 __proto__");
			if (text.trim().length === 0) errors.push("快捷消息正文不能为空");
			return errors;
		}
		//#endregion
		//#region src/client/quick-messages-panel.tsx
		/**
		* Capability Panel 的快捷消息域视图。
		*
		* 列出合并后的快捷消息（全局 `~/.dsh/quick-messages.json` + 项目
		* `<项目根>/.dsh/quick-messages.json`，同名条目两个作用域各保留一份），
		* 按 All / Project / Global 作用域 Tab（见 scope-tabs.ts）+ 搜索过滤；
		* 支持 新增 / 编辑 / 删除 / 启用禁用。写入直接落配置文件，
		* 不涉及任何 session 挂载（快捷消息是纯数据）。
		*
		* @module @chengdb/capability-panel/client/quick-messages-panel
		*/
		/** 复合行 id：同名条目可能同时存在于 project 与 global 两个作用域。 */
		function rowId$1(message) {
			return `${message.scope}:${message.name}`;
		}
		/**
		* 快捷消息视图主组件：状态管理 + 拉取/重拉 + 列表 + 详情/表单。
		*/
		function QuickMessagesPanel({ api, workspace }) {
			const [messages, setMessages] = (0, react.useState)([]);
			const [listErrors, setListErrors] = (0, react.useState)([]);
			const [loading, setLoading] = (0, react.useState)(true);
			const [opError, setOpError] = (0, react.useState)(void 0);
			const [tab, setTab] = (0, react.useState)("all");
			const [query, setQuery] = (0, react.useState)("");
			const [selected, setSelected] = (0, react.useState)(void 0);
			const [editMessage, setEditMessage] = (0, react.useState)(void 0);
			const [addOpen, setAddOpen] = (0, react.useState)(false);
			const [confirmDelete, setConfirmDelete] = (0, react.useState)(void 0);
			/** 请求序号：只让"最新一次"reload 的结果落地，防乱序旧响应覆盖新状态。 */
			const reloadSeq = (0, react.useRef)(0);
			/** 重新拉取列表（list 单接口，无挂载状态）。 */
			const reload = () => {
				const seq = ++reloadSeq.current;
				let cancelled = false;
				setLoading(true);
				setOpError(void 0);
				api.list().then((list) => {
					if (cancelled || seq !== reloadSeq.current) return;
					setMessages(list.messages);
					setListErrors(list.errors);
				}).catch((err) => {
					if (cancelled || seq !== reloadSeq.current) return;
					setOpError(String(err));
				}).finally(() => {
					if (cancelled || seq !== reloadSeq.current) return;
					setLoading(false);
				});
				return () => {
					cancelled = true;
				};
			};
			(0, react.useEffect)(reload, [api, workspace]);
			const visible = (0, react.useMemo)(() => {
				const q = query.trim().toLowerCase();
				return messages.filter((message) => {
					const inScope = tab === "all" || message.scope === tab;
					const inQuery = q.length === 0 || message.name.toLowerCase().includes(q) || message.text.toLowerCase().includes(q);
					return inScope && inQuery;
				});
			}, [
				messages,
				tab,
				query
			]);
			const selectedMessage = messages.find((m) => rowId$1(m) === selected);
			/** 执行一次写操作：失败写 opError；成功清错误并重拉列表。返回是否成功。 */
			const runOp = async (op) => {
				const result = await op;
				if (!result.ok) {
					setOpError(result.errors.join("; "));
					return false;
				}
				setOpError(void 0);
				reload();
				return true;
			};
			/** 启用/禁用切换（直接写入配置文件）。 */
			const onToggle = (message) => {
				runOp(api.setEnabled({
					scope: message.scope,
					name: message.name,
					enabled: !message.enabled
				}));
			};
			/** 删除：第一次点击进入确认态；同一行再次点击才真正删除并清空选中。 */
			const onDelete = (message) => {
				const id = rowId$1(message);
				if (confirmDelete !== id) {
					setConfirmDelete(id);
					return;
				}
				setConfirmDelete(void 0);
				runOp(api.remove({
					scope: message.scope,
					name: message.name
				})).then((ok) => {
					if (ok) setSelected(void 0);
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "skp-domain",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "skp-subheader",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "skp-tabs",
								role: "tablist",
								children: [
									"all",
									"project",
									"global"
								].map((t) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									role: "tab",
									"aria-selected": tab === t,
									className: tab === t ? "skp-tab skp-tab-active" : "skp-tab",
									onClick: () => setTab(t),
									children: SCOPE_LABEL[t]
								}, t))
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: "skp-search",
								type: "search",
								placeholder: "搜索快捷消息…",
								value: query,
								onChange: (e) => setQuery(e.target.value)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "skp-btn skp-btn-primary",
								onClick: () => {
									setEditMessage(void 0);
									setSelected(void 0);
									setAddOpen(true);
								},
								children: "+ 新增"
							})
						]
					}),
					listErrors.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "skp-error",
						children: listErrors.join("\n")
					}),
					opError && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "skp-error",
						children: opError
					}),
					loading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "skp-status",
						children: "加载中…"
					}),
					!loading && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "skp-body",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("ul", {
							className: "skp-list",
							children: [visible.map((message) => {
								const id = rowId$1(message);
								return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									className: selected === id ? "skp-row skp-row-active" : "skp-row",
									onClick: () => {
										setSelected(id);
										setEditMessage(void 0);
										setConfirmDelete(void 0);
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: "skp-row-name",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: `skp-dot ${message.enabled ? "skp-dot-enabled" : ""}`,
												title: message.enabled ? "已启用" : "已禁用"
											}), message.name]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: "skp-row-meta",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: message.scope === "project" ? "skp-tag skp-tag-project" : "skp-tag skp-tag-global",
												children: message.scope === "project" ? "项目" : "全局"
											}), !message.enabled && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "skp-tag skp-tag-readonly",
												children: "已禁用"
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "skp-row-desc",
											children: message.text
										})
									]
								}) }, id);
							}), visible.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", {
								className: "skp-empty",
								children: "没有匹配的快捷消息。"
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "skp-detail",
							children: selectedMessage ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuickMessageDetail, {
								message: selectedMessage,
								confirming: confirmDelete === rowId$1(selectedMessage),
								onEdit: () => setEditMessage(selectedMessage),
								onToggle: () => onToggle(selectedMessage),
								onDelete: () => onDelete(selectedMessage)
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "skp-detail-empty",
								children: "选择一条快捷消息查看详情，或新增一条。"
							})
						})]
					}),
					addOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuickMessageAddDialog, {
						api,
						workspace,
						onClose: () => setAddOpen(false),
						onMutated: () => reload()
					}),
					editMessage !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuickMessageEditDialog, {
						api,
						message: editMessage,
						onClose: () => setEditMessage(void 0),
						onSaved: () => reload()
					})
				]
			});
		}
		/** 详情卡片：只读展示条目字段 + 编辑/启停/删除操作。 */
		function QuickMessageDetail({ message, confirming, onEdit, onToggle, onDelete }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "skp-detail-card",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "skp-detail-head",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: message.name }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "skp-detail-actions",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "skp-detail-enable",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "skp-switch",
									title: message.enabled ? "点击禁用（保留在配置文件中，从快捷弹层隐藏）" : "点击启用（出现在输入框快捷弹层）",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										checked: message.enabled,
										onChange: onToggle
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "skp-switch-track" })]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "skp-detail-enable-label",
									children: message.enabled ? "已启用" : "已禁用"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "skp-btn",
								onClick: onEdit,
								children: "编辑"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: confirming ? "skp-btn skp-btn-danger" : "skp-btn skp-btn-danger-ghost",
								onClick: onDelete,
								children: confirming ? "确认删除？" : "删除"
							})
						]
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
					className: "skp-detail-fields",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "内容" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
							style: {
								whiteSpace: "pre-wrap",
								wordBreak: "break-word"
							},
							children: message.text
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "作用域" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: message.scope === "project" ? "项目" : "全局" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "配置文件" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
							className: "skp-path",
							children: message.filePath
						})
					]
				})]
			});
		}
		/** 新增 / 编辑共用的表单字段（分别内嵌在添加 / 编辑弹窗里）。 */
		function QuickMessageForm({ mode, message, workspace, onCancel, onSave }) {
			const isNew = mode === "new";
			const noWorkspace = workspace === void 0 || workspace === "（无工作区）";
			const [scope, setScope] = (0, react.useState)(message?.scope ?? (noWorkspace ? "global" : "project"));
			const [name, setName] = (0, react.useState)(message?.name ?? "");
			const [text, setText] = (0, react.useState)(message?.text ?? "");
			const [errors, setErrors] = (0, react.useState)([]);
			const [saving, setSaving] = (0, react.useState)(false);
			/** 客户端前置校验（与宿主的 validateQuickMessage 保持同口径，快速反馈）。 */
			const submit = async () => {
				const problems = validateQuickMessage(name, text);
				if (problems.length > 0) {
					setErrors(problems);
					return;
				}
				setSaving(true);
				try {
					await onSave(scope, name.trim(), text);
					setErrors([]);
				} catch (error) {
					setErrors([error instanceof Error ? error.message : String(error)]);
				} finally {
					setSaving(false);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "skp-form",
				children: [
					errors.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "skp-error",
						children: errors.join("\n")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "skp-field",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "skp-field-label",
							children: "作用域"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkpSelect, {
							value: scope,
							disabled: !isNew,
							ariaLabel: "快捷消息作用域",
							options: [{
								value: "project",
								label: "项目（.dsh/quick-messages.json）",
								disabled: noWorkspace
							}, {
								value: "global",
								label: "全局（~/.dsh/quick-messages.json）"
							}],
							onChange: (value) => setScope(value === "project" ? "project" : "global")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "skp-field",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "skp-field-label",
							children: "名称"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: "skp-input",
							value: name,
							disabled: !isNew,
							placeholder: "例如：开场白 / 翻译 / 代码审查",
							onChange: (e) => setName(e.target.value)
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "skp-field",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "skp-field-label",
							children: "内容"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							className: "skp-input skp-textarea",
							value: text,
							placeholder: "输入快捷消息的正文，点击后将原样追加到输入框草稿…",
							onChange: (e) => setText(e.target.value)
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "skp-modal-actions",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "skp-btn",
							onClick: onCancel,
							children: "取消"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "skp-btn skp-btn-primary",
							disabled: saving,
							onClick: () => void submit(),
							children: saving ? "保存中…" : isNew ? "新增" : "保存"
						})]
					})
				]
			});
		}
		/** 新增弹窗。 */
		function QuickMessageAddDialog({ api, workspace, onClose, onMutated }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Modal, {
				title: "新增快捷消息",
				onClose,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuickMessageForm, {
					mode: "new",
					workspace,
					onCancel: onClose,
					onSave: async (scope, name, text) => {
						const result = await api.upsert({
							scope,
							name,
							text
						});
						if (!result.ok) throw new Error(result.errors.join("; "));
						onMutated();
						onClose();
					}
				})
			});
		}
		/** 编辑弹窗（名称不可改，与 MCP 同口径；正文保存时保留原启停态）。 */
		function QuickMessageEditDialog({ api, message, onClose, onSaved }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Modal, {
				title: `编辑「${message.name}」`,
				onClose,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuickMessageForm, {
					mode: "edit",
					message,
					onCancel: onClose,
					onSave: async (scope, name, text) => {
						const result = await api.upsert({
							scope,
							name,
							text
						});
						if (!result.ok) throw new Error(result.errors.join("; "));
						onSaved();
						onClose();
					}
				})
			});
		}
		//#endregion
		//#region src/shared/skill-locate.ts
		/**
		* 在相对路径列表中定位 skill 根。路径约定为 posix 风格（`/` 分隔）、
		* 不含 `./` 或 `..` 段（调用方在解压/收集时已规范化）。
		*/
		function locateSkillRoot(paths) {
			const skillFiles = paths.filter((p) => p === "SKILL.md" || p.endsWith("/SKILL.md"));
			if (skillFiles.length > 0) {
				const depth = (p) => p.split("/").length;
				const minDepth = Math.min(...skillFiles.map(depth));
				const shallowest = skillFiles.filter((p) => depth(p) === minDepth);
				if (shallowest.length > 1) return {
					ok: false,
					error: `archive contains multiple skills (${shallowest.map((p) => p.slice(0, -9) || ".").join(", ")}) — pick one or use a subfolder URL`
				};
				const skillFile = shallowest[0];
				return {
					ok: true,
					root: {
						baseDir: skillFile === "SKILL.md" ? "" : skillFile.slice(0, -9),
						kind: "directory"
					}
				};
			}
			const flatCandidates = paths.filter((p) => !p.includes("/") && p.endsWith(".md"));
			if (flatCandidates.length === 1) return {
				ok: true,
				root: {
					baseDir: "",
					kind: "flat"
				}
			};
			if (flatCandidates.length > 1) return {
				ok: false,
				error: `archive has multiple top-level .md files (${flatCandidates.join(", ")}) and no SKILL.md`
			};
			return {
				ok: false,
				error: "no SKILL.md or top-level .md found in archive"
			};
		}
		/**
		* 若所有路径共享同一个首段（zipball 典型的 `<owner>-<repo>-<sha>/` 顶层
		* 文件夹），返回剥掉该首段后的路径列表；否则原样返回。
		*/
		function stripCommonTopFolder(paths) {
			if (paths.length === 0) return paths;
			const firstSegment = paths[0].split("/")[0];
			if (!paths.every((p) => p.includes("/") && p.split("/")[0] === firstSegment)) return paths;
			return paths.map((p) => p.slice(firstSegment.length + 1));
		}
		/**
		* 按定位结果把一组文件裁剪并重定根：只保留 skill 根下的文件，路径改写为
		* 相对 skill 根。flat 布局只保留那个 .md 文件本身。
		*/
		function rerootEntries(entries, root) {
			if (root.kind === "flat") return entries.filter((e) => !e.path.includes("/") && e.path.endsWith(".md"));
			const prefix = root.baseDir === "" ? "" : `${root.baseDir}/`;
			return entries.filter((e) => prefix === "" || e.path.startsWith(prefix)).map((e) => ({
				...e,
				path: prefix === "" ? e.path : e.path.slice(prefix.length)
			}));
		}
		//#endregion
		//#region src/client/unzip.ts
		const EOCD_SIGNATURE = 101010256;
		const CENTRAL_SIGNATURE = 33639248;
		const LOCAL_SIGNATURE = 67324752;
		const EOCD_SEARCH_WINDOW = 65557;
		/** 解压整个 zip；目录条目跳过，不支持的条目抛错。 */
		async function unzip(archive) {
			if (typeof DecompressionStream === "undefined") throw new Error("this browser does not support zip extraction (DecompressionStream unavailable)");
			const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
			const decoder = new TextDecoder("utf-8");
			const eocdOffset = findEocd(view);
			const entryCount = view.getUint16(eocdOffset + 10, true);
			let centralOffset = view.getUint32(eocdOffset + 16, true);
			const entries = [];
			for (let i = 0; i < entryCount; i += 1) {
				if (view.getUint32(centralOffset, true) !== CENTRAL_SIGNATURE) throw new Error(`corrupt zip: bad central directory record #${i}`);
				const flags = view.getUint16(centralOffset + 8, true);
				const method = view.getUint16(centralOffset + 10, true);
				const compressedSize = view.getUint32(centralOffset + 20, true);
				const nameLength = view.getUint16(centralOffset + 28, true);
				const extraLength = view.getUint16(centralOffset + 30, true);
				const commentLength = view.getUint16(centralOffset + 32, true);
				const localOffset = view.getUint32(centralOffset + 42, true);
				const name = decoder.decode(archive.subarray(centralOffset + 46, centralOffset + 46 + nameLength)).split("\\").join("/");
				centralOffset += 46 + nameLength + extraLength + commentLength;
				if (name.endsWith("/")) continue;
				if ((flags & 1) !== 0) throw new Error(`encrypted zip entries are not supported ("${name}")`);
				if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) throw new Error(`corrupt zip: bad local header for "${name}"`);
				const localNameLength = view.getUint16(localOffset + 26, true);
				const localExtraLength = view.getUint16(localOffset + 28, true);
				const dataStart = localOffset + 30 + localNameLength + localExtraLength;
				const compressed = archive.subarray(dataStart, dataStart + compressedSize);
				entries.push({
					path: name,
					data: await inflateEntry(method, compressed, name)
				});
			}
			return entries;
		}
		/** 按压缩方法解压单条；不支持的方法抛错。 */
		async function inflateEntry(method, compressed, name) {
			if (method === 0) return compressed.slice();
			if (method === 8) {
				const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
				return new Uint8Array(await new Response(stream).arrayBuffer());
			}
			throw new Error(`unsupported zip compression method ${method} ("${name}")`);
		}
		/** 从尾部窗口倒扫 EOCD 签名；找不到即不是（或已损坏的）zip。 */
		function findEocd(view) {
			const windowStart = Math.max(0, view.byteLength - EOCD_SEARCH_WINDOW);
			for (let offset = view.byteLength - 22; offset >= windowStart; offset -= 1) if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
			throw new Error("not a zip archive (end of central directory not found)");
		}
		//#endregion
		//#region src/client/zip.ts
		/** base64 → 字节（浏览器 atob；分块避免参数过长）。 */
		function base64ToBytes(base64) {
			const binary = atob(base64);
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
			return bytes;
		}
		/** 把若干条目打成 store-only ZIP，返回整个归档的字节。 */
		function buildZip(entries) {
			const encoder = new TextEncoder();
			const chunks = [];
			const central = [];
			let offset = 0;
			for (const entry of entries) {
				const nameBytes = encoder.encode(entry.name);
				const crc = crc32(entry.data);
				const { dosTime, dosDate } = dosDateTime(/* @__PURE__ */ new Date());
				const local = /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(30));
				local.setUint32(0, 67324752, true);
				local.setUint16(4, 20, true);
				local.setUint16(6, 2048, true);
				local.setUint16(8, 0, true);
				local.setUint16(10, dosTime, true);
				local.setUint16(12, dosDate, true);
				local.setUint32(14, crc, true);
				local.setUint32(18, entry.data.length, true);
				local.setUint32(22, entry.data.length, true);
				local.setUint16(26, nameBytes.length, true);
				local.setUint16(28, 0, true);
				chunks.push(new Uint8Array(local.buffer), nameBytes, entry.data);
				const record = /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(46));
				record.setUint32(0, 33639248, true);
				record.setUint16(4, 20, true);
				record.setUint16(6, 20, true);
				record.setUint16(8, 2048, true);
				record.setUint16(10, 0, true);
				record.setUint16(12, dosTime, true);
				record.setUint16(14, dosDate, true);
				record.setUint32(16, crc, true);
				record.setUint32(20, entry.data.length, true);
				record.setUint32(24, entry.data.length, true);
				record.setUint16(28, nameBytes.length, true);
				record.setUint32(42, offset, true);
				central.push(new Uint8Array(record.buffer), nameBytes);
				offset += 30 + nameBytes.length + entry.data.length;
			}
			const centralStart = offset;
			let centralSize = 0;
			for (const chunk of central) centralSize += chunk.length;
			const eocd = /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(22));
			eocd.setUint32(0, 101010256, true);
			eocd.setUint16(8, entries.length, true);
			eocd.setUint16(10, entries.length, true);
			eocd.setUint32(12, centralSize, true);
			eocd.setUint32(16, centralStart, true);
			const total = centralStart + centralSize + 22;
			const out = new Uint8Array(total);
			let cursor = 0;
			for (const chunk of [
				...chunks,
				...central,
				new Uint8Array(eocd.buffer)
			]) {
				out.set(chunk, cursor);
				cursor += chunk.length;
			}
			return out;
		}
		/** 触发一次浏览器下载（Blob → objectURL → 临时 <a> 点击 → 回收）。 */
		function downloadBytes(filename, data, mime = "application/octet-stream") {
			const blob = new Blob([data], { type: mime });
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = filename;
			anchor.click();
			setTimeout(() => URL.revokeObjectURL(url), 1e3);
		}
		/** CRC-32（ZIP 必需；查表法，表懒初始化一次）。 */
		let crcTable;
		function crc32(data) {
			if (crcTable === void 0) {
				crcTable = /* @__PURE__ */ new Uint32Array(256);
				for (let n = 0; n < 256; n += 1) {
					let c = n;
					for (let k = 0; k < 8; k += 1) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
					crcTable[n] = c >>> 0;
				}
			}
			let crc = 4294967295;
			for (let i = 0; i < data.length; i += 1) crc = (crcTable[(crc ^ data[i]) & 255] ^ crc >>> 8) >>> 0;
			return (crc ^ 4294967295) >>> 0;
		}
		/** Date → DOS 时间/日期字段（ZIP 头部格式；月/年越界时钳位）。 */
		function dosDateTime(date) {
			const year = Math.min(Math.max(date.getFullYear(), 1980), 2107);
			return {
				dosTime: date.getHours() << 11 | date.getMinutes() << 5 | Math.floor(date.getSeconds() / 2),
				dosDate: (year - 1980 & 127) << 9 | date.getMonth() + 1 << 5 | date.getDate()
			};
		}
		//#endregion
		//#region src/client/panel.tsx
		/**
		* Capability Panel 的 React 视图（侧栏底部按钮弹出的浮层面板）。
		*
		* 根容器按能力域分 Tab：
		*   - 快捷消息：项目 + 全局快捷语，支持搜索/过滤与详情视图（见
		*     `quick-messages-panel.tsx`）；
		*   - Skills：项目 + 全局技能，支持搜索/过滤与详情视图；
		*   - MCP：项目 `.mcp.json` + 全局 `mcp.json` 的 server 管理，
		*     带每个 session 的实时挂载状态（见 `mcp-panel.tsx`）。
		*
		* 布局刻意保持朴素（自带 CSS 类，见 styles.ts），对未经确认的 UI 原语
		* 组件零硬依赖。
		*
		* @module @chengdb/capability-panel/client/panel
		*/
		/** 每个域 Tab 的展示文案（当前硬编码中文，见 client.ts 的 locale 说明）。 */
		const DOMAIN_LABEL = {
			quickMessages: "快捷消息",
			skills: "技能",
			mcp: "MCP"
		};
		/**
		* 面板根组件：头部（标题 + 项目下拉框 + 关闭按钮 + 域 Tab）
		* + 当前域视图（Skills / MCP）。
		*/
		function CapabilityPanel({ api, onClose }) {
			const [domain, setDomain] = (0, react.useState)("skills");
			const [workspace, setWorkspace] = (0, react.useState)(() => api.workspaceLabel());
			const [projects, setProjects] = (0, react.useState)(() => api.projects());
			const [pinned, setPinned] = (0, react.useState)(() => api.selectedProject());
			(0, react.useEffect)(() => {
				let alive = true;
				const update = () => {
					if (!alive) return;
					setWorkspace(api.workspaceLabel());
					setProjects(api.projects());
					setPinned(api.selectedProject());
				};
				const unsub = api.subscribeWorkspace(update);
				update();
				return () => {
					alive = false;
					unsub();
				};
			}, [api]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "skp-panel",
				"aria-label": "能力面板",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
					className: "skp-header",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "skp-title-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "skp-title-main",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: "能力面板" }), workspace !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "skp-workspace",
								title: workspace,
								children: workspace
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "skp-title-tools",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkpSelect, {
								className: "skp-dd-scope",
								value: pinned ?? "",
								title: workspace,
								ariaLabel: "项目作用域",
								options: [
									{
										value: "",
										label: "跟随当前会话"
									},
									...projects.map((p) => ({
										value: p.path,
										label: p.title ?? p.path
									})),
									...pinned !== void 0 && !projects.some((p) => p.path === pinned) ? [{
										value: pinned,
										label: pinned
									}] : []
								],
								onChange: (value) => api.selectProject(value === "" ? void 0 : value)
							}), onClose !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "skp-close",
								type: "button",
								"aria-label": "关闭能力面板",
								title: "关闭面板",
								onClick: onClose,
								children: "✕"
							})]
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "skp-tabs",
						role: "tablist",
						children: [
							"quickMessages",
							"skills",
							"mcp"
						].map((d) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							role: "tab",
							"aria-selected": domain === d,
							className: domain === d ? "skp-tab skp-tab-active" : "skp-tab",
							onClick: () => setDomain(d),
							children: DOMAIN_LABEL[d]
						}, d))
					})]
				}), domain === "skills" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillsView, {
					api: api.skills,
					workspace
				}) : domain === "mcp" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(McpView, {
					api: api.mcp,
					workspace
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuickMessagesPanel, {
					api: api.quickMessages,
					workspace
				})]
			});
		}
		/**
		* 侧栏底部入口：Settings 旁的一个按钮，点击切换居中的浮层面板。
		*
		* 根 div 同时包裹按钮与浮层，因此浮层内部的点击不会命中"外部 pointerdown
		* 关闭"的判定。注册目标是根作用域的 `sidebar.footer.action` 列表槽
		* （replace-risk none）：纯增量、不绑定 session。
		*/
		function CapabilitiesFooterAction({ api, wide }) {
			const [open, setOpen] = (0, react.useState)(false);
			const rootRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				if (!open) return;
				const onPointerDown = (event) => {
					if (rootRef.current !== null && event.target instanceof Node && !rootRef.current.contains(event.target)) setOpen(false);
				};
				document.addEventListener("pointerdown", onPointerDown, true);
				return () => document.removeEventListener("pointerdown", onPointerDown, true);
			}, [open]);
			(0, react.useEffect)(() => {
				if (!open) return;
				const onKeyDown = (event) => {
					if (event.key === "Escape") setOpen(false);
				};
				document.addEventListener("keydown", onKeyDown);
				return () => document.removeEventListener("keydown", onKeyDown);
			}, [open]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: rootRef,
				className: "skp-foot",
				children: [open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "skp-backdrop",
					onClick: () => setOpen(false)
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "skp-popover",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CapabilityPanel, {
						api,
						onClose: () => setOpen(false)
					})
				})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "skp-foot-btn",
					"aria-expanded": open,
					title: "能力面板",
					onClick: () => setOpen((value) => !value),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						"aria-hidden": "true",
						className: "skp-foot-icon",
						children: "✦"
					}), wide && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "skp-foot-label",
						children: "能力面板"
					})]
				})]
			});
		}
		/**
		* Skills 视图：作用域 Tab（All/Project/Global）+ 搜索 + 安装入口 + 列表 + 详情。
		* 列表来自宿主受管根目录的磁盘视图；安装/导出/移除后通过 refreshKey 重拉。
		*/
		function SkillsView({ api, workspace }) {
			const [tab, setTab] = (0, react.useState)("all");
			const [query, setQuery] = (0, react.useState)("");
			const [items, setItems] = (0, react.useState)([]);
			const [loading, setLoading] = (0, react.useState)(true);
			const [error, setError] = (0, react.useState)(void 0);
			const [selected, setSelected] = (0, react.useState)(void 0);
			const [refreshKey, setRefreshKey] = (0, react.useState)(0);
			const [installOpen, setInstallOpen] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				let cancelled = false;
				setLoading(true);
				setError(void 0);
				api.list().then((list) => {
					if (cancelled) return;
					setItems(list);
				}).catch((err) => {
					if (!cancelled) setError(String(err));
				}).finally(() => {
					if (!cancelled) setLoading(false);
				});
				return () => {
					cancelled = true;
				};
			}, [
				api,
				workspace,
				refreshKey
			]);
			const reload = () => setRefreshKey((key) => key + 1);
			const visible = (0, react.useMemo)(() => {
				const q = query.trim().toLowerCase();
				return items.filter((item) => {
					const inScope = tab === "all" || (tab === "project" ? isProjectSource$1(item.source) : !isProjectSource$1(item.source));
					const inQuery = q.length === 0 || item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
					return inScope && inQuery;
				});
			}, [
				items,
				tab,
				query
			]);
			const selectedItem = items.find((item) => skillRowKey(item) === selected);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "skp-domain",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "skp-subheader",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "skp-tabs",
								role: "tablist",
								children: [
									"all",
									"project",
									"global"
								].map((t) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									role: "tab",
									"aria-selected": tab === t,
									className: tab === t ? "skp-tab skp-tab-active" : "skp-tab",
									onClick: () => setTab(t),
									children: SCOPE_LABEL[t]
								}, t))
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: "skp-search",
								type: "search",
								placeholder: "搜索技能…",
								value: query,
								onChange: (e) => setQuery(e.target.value)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "skp-btn skp-btn-primary",
								onClick: () => setInstallOpen(true),
								children: "+ 安装"
							})
						]
					}),
					loading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "skp-status",
						children: "加载中…"
					}),
					error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "skp-error",
						children: error
					}),
					!loading && !error && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "skp-body",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("ul", {
							className: "skp-list",
							children: [visible.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								className: selected === skillRowKey(item) ? "skp-row skp-row-active" : "skp-row",
								onClick: () => setSelected(skillRowKey(item)),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "skp-row-name",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: `skp-dot ${isSkillEnabled(item) ? "skp-dot-enabled" : ""}`,
											title: item.readOnly ? "只读条目" : isSkillEnabled(item) ? "已启用（模型与用户均可调用）" : "已禁用（用户与模型都不可调用）"
										}), item.name]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "skp-row-meta",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: isProjectSource$1(item.source) ? "skp-tag skp-tag-project" : "skp-tag skp-tag-global",
												children: isProjectSource$1(item.source) ? "项目" : "全局"
											}),
											item.readOnly ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "skp-tag skp-tag-readonly",
												children: "只读"
											}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: item.format === "directory" ? "skp-tag skp-tag-directory" : "skp-tag skp-tag-flat",
												children: item.format === "directory" ? "目录" : "单文件"
											}),
											!item.readOnly && !isSkillEnabled(item) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "skp-tag skp-tag-readonly",
												children: "已禁用"
											})
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "skp-row-desc",
										children: item.description
									})
								]
							}) }, skillRowKey(item))), visible.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", {
								className: "skp-empty",
								children: "没有匹配的技能。"
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "skp-detail",
							children: selectedItem ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillDetail, {
								summary: selectedItem,
								api,
								onChanged: () => reload(),
								onRemoved: () => {
									setSelected(void 0);
									reload();
								}
							}, skillRowKey(selectedItem)) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "skp-detail-empty",
								children: "选择一项技能查看详情。"
							})
						})]
					}),
					installOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InstallDialog, {
						api,
						hasWorkspace: workspace !== void 0 && workspace !== "（无工作区）",
						onClose: () => setInstallOpen(false),
						onInstalled: () => {
							setInstallOpen(false);
							reload();
						}
					})
				]
			});
		}
		/** source 是否属于"项目系"（决定 scope 标签与 Tab 归属）。 */
		function isProjectSource$1(source) {
			return source === "project-dsh" || source === "project-agents" || source === "custom";
		}
		/** 整体启用态 = 模型与用户两种调用都开着（与详情卡开关同一口径）。 */
		function isSkillEnabled(item) {
			return item.modelInvocable && item.userInvocable;
		}
		/**
		* React 行 key 与选中项标识。
		*
		* 技巧名在合并列表里**不唯一**——同一个名字可能出现在多个根
		* （例如项目副本遮蔽全局同名项）——重复 key 会破坏 React 列表调和
		* （重渲染时残留过期行）。所以 key 用 `source:name` 复合。
		*/
		function skillRowKey(item) {
			return `${item.source}:${item.name}`;
		}
		/**
		* 详情卡片：元信息 + 路径 + 写操作（启用/禁用开关、导出下载、
		* 导出到宿主路径、移除）。只读条目（custom / bundled）只展示徽标，不提供操作。
		*
		* 组件以 `key={source:name}` 挂载（见 SkillsView），切换选中行即整体重挂，
		* 因此确认态/错误态不需要手动随行切换重置。
		*/
		function SkillDetail({ summary, api, onChanged, onRemoved }) {
			const [busy, setBusy] = (0, react.useState)(false);
			const [opError, setOpError] = (0, react.useState)(void 0);
			const [confirmRemove, setConfirmRemove] = (0, react.useState)(false);
			const [exportPathOpen, setExportPathOpen] = (0, react.useState)(false);
			/**
			* 一键启用/禁用：开关状态 = 模型与用户都可用（两者任一被关即视为禁用）。
			* 操作落盘成功后重拉列表（项目根/全局根读盘）；保留选中，详情随新摘要
			* 刷新（开关、调用方式行都会更新）。
			*/
			const doSetEnabled = async (next) => {
				setBusy(true);
				setOpError(void 0);
				try {
					const result = await api.setEnabled({
						...skillRef(summary),
						enabled: next
					});
					if (!result.ok) {
						setOpError(result.errors.join("; "));
						return;
					}
					onChanged();
				} catch (error) {
					setOpError(String(error));
				} finally {
					setBusy(false);
				}
			};
			/** 导出为浏览器下载：flat ⇒ 单个 .md；directory ⇒ 打 zip（store-only）。 */
			const doExportDownload = async () => {
				setBusy(true);
				setOpError(void 0);
				try {
					const result = await api.exportFiles(skillRef(summary));
					if (!result.ok) {
						setOpError(result.errors.join("; "));
						return;
					}
					if (result.format === "flat" && result.files.length === 1) downloadBytes(`${result.name}.md`, base64ToBytes(result.files[0].content), "text/markdown");
					else {
						const zip = buildZip(result.files.map((file) => ({
							name: `${result.name}/${file.path}`,
							data: base64ToBytes(file.content)
						})));
						downloadBytes(`${result.name}.zip`, zip, "application/zip");
					}
				} catch (error) {
					setOpError(String(error));
				} finally {
					setBusy(false);
				}
			};
			/** 移除：两击确认（与 MCP 视图的 Delete 同一交互约定）。 */
			const doRemove = async () => {
				if (!confirmRemove) {
					setConfirmRemove(true);
					return;
				}
				setBusy(true);
				setOpError(void 0);
				try {
					const result = await api.remove(skillRef(summary));
					if (!result.ok) {
						setOpError(result.errors.join("; "));
						setConfirmRemove(false);
						return;
					}
					onRemoved();
				} catch (error) {
					setOpError(String(error));
					setConfirmRemove(false);
				} finally {
					setBusy(false);
				}
			};
			/** 整体启用态 = 模型与用户两种调用都开着（任一被关即视为已禁用）。 */
			const enabled = summary.modelInvocable && summary.userInvocable;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "skp-detail-card",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "skp-detail-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: summary.name }), summary.readOnly ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "skp-badge",
							children: "只读"
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "skp-detail-actions",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "skp-detail-enable",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: "skp-switch",
										title: enabled ? "点击禁用（用户与模型都不可调用）" : "点击启用（恢复用户与模型调用）",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: enabled,
											disabled: busy,
											onChange: (e) => void doSetEnabled(e.currentTarget.checked)
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "skp-switch-track" })]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "skp-detail-enable-label",
										children: enabled ? "已启用" : "已禁用"
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "skp-btn",
									disabled: busy,
									onClick: doExportDownload,
									children: "导出"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "skp-btn",
									disabled: busy,
									onClick: () => setExportPathOpen(true),
									children: "导出到路径…"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: confirmRemove ? "skp-btn skp-btn-danger" : "skp-btn skp-btn-danger-ghost",
									disabled: busy,
									onClick: doRemove,
									children: confirmRemove ? "确认移除？" : "移除"
								})
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
						className: "skp-detail-fields",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "描述" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: summary.description }),
							summary.whenToUse !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "使用时机" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: summary.whenToUse })] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "调用方式" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dd", { children: [
								"模型：",
								summary.modelInvocable ? "✓" : "✗",
								" · 用户：",
								summary.userInvocable ? "✓" : "✗"
							] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "来源" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: summary.source }),
							summary.path !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "路径" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
								className: "skp-path",
								children: summary.path
							})] })
						]
					}),
					opError !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "skp-error",
						children: opError
					}),
					exportPathOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ExportToPathDialog, {
						summary,
						api,
						onClose: () => setExportPathOpen(false)
					})
				]
			});
		}
		/**
		* 组装一行的寻址入参：优先用宿主给的受管根（精确，覆盖 user-agents 等
		* scope 表达不了的根）；root 缺失时按 source 退化到 scope/target。
		*/
		function skillRef(summary) {
			if (summary.root !== void 0) return {
				name: summary.name,
				root: summary.root
			};
			if (summary.source === "project-dsh") return {
				name: summary.name,
				scope: "project",
				target: ".dsh"
			};
			if (summary.source === "project-agents") return {
				name: summary.name,
				scope: "project",
				target: ".agents"
			};
			return {
				name: summary.name,
				scope: "global"
			};
		}
		/** 安装对话框的来源模式与 Tab 文案。 */
		const INSTALL_MODE = {
			upload: "上传",
			path: "宿主路径",
			url: "URL"
		};
		/**
		* 安装对话框：三种来源——浏览器上传（单个 .md / 整个 skill 目录 / .zip
		* 压缩包）、宿主磁盘路径、URL 下载（GitHub 仓库 / .zip / raw .md）。
		* 目标作用域三选一（无工作区时禁用 project）。
		*/
		function InstallDialog({ api, hasWorkspace, onClose, onInstalled }) {
			const [mode, setMode] = (0, react.useState)("upload");
			const [scopeChoice, setScopeChoice] = (0, react.useState)(hasWorkspace ? "project-dsh" : "global");
			const [overwrite, setOverwrite] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [errors, setErrors] = (0, react.useState)([]);
			const [sourcePath, setSourcePath] = (0, react.useState)("");
			const [url, setUrl] = (0, react.useState)("");
			const [picked, setPicked] = (0, react.useState)(void 0);
			const fileInputRef = (0, react.useRef)(null);
			const dirInputRef = (0, react.useRef)(null);
			const zipInputRef = (0, react.useRef)(null);
			/** 选中单个 .md 文件（flat 安装）。 */
			const onPickFile = async (input) => {
				const file = input.files?.[0];
				input.value = "";
				if (file === void 0) return;
				setErrors([]);
				try {
					const content = await fileToBase64(file);
					setPicked({
						label: file.name,
						files: [{
							path: file.name,
							content
						}]
					});
				} catch (error) {
					setErrors([String(error)]);
				}
			};
			/**
			* 选中整个目录（directory 安装）：webkitRelativePath 形如
			* `<folder>/<rel>`，剥掉首段得到 skill 内部相对路径；根上必须有 SKILL.md。
			*/
			const onPickDirectory = async (input) => {
				const files = Array.from(input.files ?? []);
				input.value = "";
				if (files.length === 0) return;
				setErrors([]);
				try {
					const payload = [];
					let folder = "";
					for (const file of files) {
						const segments = (file.webkitRelativePath || file.name).split("/");
						folder = segments[0] ?? folder;
						const inner = segments.slice(1).join("/");
						if (inner.length === 0) continue;
						payload.push({
							path: inner,
							content: await fileToBase64(file)
						});
					}
					if (!payload.some((entry) => entry.path === "SKILL.md")) {
						setPicked(void 0);
						setErrors([`文件夹 "${folder}" 的根目录下没有 SKILL.md`]);
						return;
					}
					setPicked({
						label: `${folder}/（${payload.length} 个文件）`,
						files: payload
					});
				} catch (error) {
					setErrors([String(error)]);
				}
			};
			/**
			* 选中 .zip 压缩包：浏览器端解压 → 剥公共顶层文件夹 → 与宿主下载安装
			* 同一套 locate 口径定位 skill 根（唯一 SKILL.md 或单 flat .md）→
			* 重定根为上传清单。
			*/
			const onPickArchive = async (input) => {
				const file = input.files?.[0];
				input.value = "";
				if (file === void 0) return;
				setErrors([]);
				try {
					const entries = await unzip(new Uint8Array(await file.arrayBuffer()));
					const stripped = stripCommonTopFolder(entries.map((entry) => entry.path));
					const normalized = entries.map((entry, i) => ({
						...entry,
						path: stripped[i]
					}));
					const located = locateSkillRoot(normalized.map((entry) => entry.path));
					if (!located.ok) {
						setPicked(void 0);
						setErrors([located.error]);
						return;
					}
					const payload = rerootEntries(normalized, located.root).map((entry) => ({
						path: entry.path,
						content: bytesToBase64(entry.data)
					}));
					setPicked({
						label: `${file.name}（${payload.length} 个文件）`,
						files: payload
					});
				} catch (error) {
					setPicked(void 0);
					setErrors([String(error)]);
				}
			};
			const doInstall = async () => {
				setBusy(true);
				setErrors([]);
				const scope = scopeChoice === "global" ? "global" : "project";
				const target = scopeChoice === "project-agents" ? ".agents" : scopeChoice === "project-dsh" ? ".dsh" : void 0;
				try {
					const result = mode === "upload" ? await api.installUpload({
						scope,
						target,
						files: picked?.files ?? [],
						overwrite
					}) : mode === "path" ? await api.installFromPath({
						scope,
						target,
						sourcePath: sourcePath.trim(),
						overwrite
					}) : await api.installFromUrl({
						scope,
						target,
						url: url.trim(),
						overwrite
					});
					if (!result.ok) {
						setErrors(result.errors);
						return;
					}
					onInstalled();
				} catch (error) {
					setErrors([String(error)]);
				} finally {
					setBusy(false);
				}
			};
			const canSubmit = !busy && (mode === "upload" ? picked !== void 0 : mode === "path" ? sourcePath.trim().length > 0 : url.trim().length > 0);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Modal, {
				title: "安装技能",
				onClose,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "skp-form",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "skp-tabs",
							role: "tablist",
							children: Object.keys(INSTALL_MODE).map((m) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								role: "tab",
								"aria-selected": mode === m,
								className: mode === m ? "skp-tab skp-tab-active" : "skp-tab",
								onClick: () => setMode(m),
								children: INSTALL_MODE[m]
							}, m))
						}),
						mode === "upload" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "skp-field",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "skp-field-label",
									children: "来源"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "skp-subheader-row",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "skp-btn",
											onClick: () => fileInputRef.current?.click(),
											children: "选择 .md 文件"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "skp-btn",
											onClick: () => dirInputRef.current?.click(),
											children: "选择文件夹"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "skp-btn",
											onClick: () => zipInputRef.current?.click(),
											children: "选择 .zip"
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									ref: fileInputRef,
									type: "file",
									accept: ".md,text/markdown",
									hidden: true,
									onChange: (e) => void onPickFile(e.currentTarget)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									ref: (el) => {
										dirInputRef.current = el;
										el?.setAttribute("webkitdirectory", "");
									},
									type: "file",
									multiple: true,
									hidden: true,
									onChange: (e) => void onPickDirectory(e.currentTarget)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									ref: zipInputRef,
									type: "file",
									accept: ".zip,application/zip",
									hidden: true,
									onChange: (e) => void onPickArchive(e.currentTarget)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "skp-note",
									children: picked !== void 0 ? `已选择：${picked.label}` : "选择单个 <名称>.md 文件、包含 SKILL.md 的文件夹，或 .zip 压缩包。"
								})
							]
						}),
						mode === "path" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "skp-field",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "skp-field-label",
								children: "宿主上的源路径"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: "skp-input",
								type: "text",
								placeholder: "/path/to/skill 目录或 <名称>.md",
								value: sourcePath,
								onChange: (e) => setSourcePath(e.target.value)
							})]
						}),
						mode === "url" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "skp-field",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "skp-field-label",
									children: "下载 URL"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: "skp-input",
									type: "url",
									placeholder: "https://github.com/<owner>/<repo>[/tree/<branch>/<dir>] 或 .zip / .md 链接",
									value: url,
									onChange: (e) => setUrl(e.target.value)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "skp-note",
									children: "支持 GitHub 仓库（整库或 /tree/… 子目录）、.zip 链接或 raw .md 链接。"
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "skp-field",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "skp-field-label",
								children: "安装到"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkpSelect, {
								value: scopeChoice,
								ariaLabel: "安装目标",
								options: [
									{
										value: "project-dsh",
										label: "项目 — .dsh/skills",
										disabled: !hasWorkspace
									},
									{
										value: "project-agents",
										label: "项目 — .agents/skills",
										disabled: !hasWorkspace
									},
									{
										value: "global",
										label: "全局 — ~/.dsh/skills"
									}
								],
								onChange: (value) => setScopeChoice(value)
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: "skp-field skp-field-inline",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: overwrite,
								onChange: (e) => setOverwrite(e.target.checked)
							}), "同名技能已存在时覆盖"]
						}),
						errors.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "skp-error",
							children: errors.join("\n")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "skp-modal-actions",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "skp-btn",
								onClick: onClose,
								children: "取消"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "skp-btn skp-btn-primary",
								disabled: !canSubmit,
								onClick: doInstall,
								children: busy ? "安装中…" : "安装"
							})]
						})
					]
				})
			});
		}
		/** 导出到宿主路径的小对话框：目标目录 + 覆盖开关。 */
		function ExportToPathDialog({ summary, api, onClose }) {
			const [destDir, setDestDir] = (0, react.useState)("");
			const [overwrite, setOverwrite] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [errors, setErrors] = (0, react.useState)([]);
			const doExport = async () => {
				setBusy(true);
				setErrors([]);
				try {
					const result = await api.exportToPath({
						...skillRef(summary),
						destDir: destDir.trim(),
						overwrite
					});
					if (!result.ok) {
						setErrors(result.errors);
						return;
					}
					onClose();
				} catch (error) {
					setErrors([String(error)]);
				} finally {
					setBusy(false);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Modal, {
				title: `将「${summary.name}」导出到路径`,
				onClose,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "skp-form",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "skp-field",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "skp-field-label",
								children: "宿主上的目标目录"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: "skp-input",
								type: "text",
								placeholder: "/path/to/目标目录",
								value: destDir,
								onChange: (e) => setDestDir(e.target.value)
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: "skp-field skp-field-inline",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: overwrite,
								onChange: (e) => setOverwrite(e.target.checked)
							}), "目标已存在时覆盖"]
						}),
						errors.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "skp-error",
							children: errors.join("\n")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "skp-modal-actions",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "skp-btn",
								onClick: onClose,
								children: "取消"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "skp-btn skp-btn-primary",
								disabled: busy || destDir.trim().length === 0,
								onClick: doExport,
								children: busy ? "导出中…" : "导出"
							})]
						})
					]
				})
			});
		}
		/** File → base64（readAsDataURL 剥掉 `data:…;base64,` 前缀）。 */
		function fileToBase64(file) {
			return new Promise((resolve, reject) => {
				const reader = new FileReader();
				reader.onerror = () => reject(reader.error ?? /* @__PURE__ */ new Error(`读取 ${file.name} 失败`));
				reader.onload = () => {
					const dataUrl = String(reader.result);
					resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
				};
				reader.readAsDataURL(file);
			});
		}
		/** 字节 → base64（分块避免 fromCharCode 参数过长）。 */
		function bytesToBase64(bytes) {
			let binary = "";
			const CHUNK = 32768;
			for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
			return btoa(binary);
		}
		//#endregion
		//#region src/client/composer-mcp.tsx
		/**
		* 输入框工具行的 MCP 快捷开关。
		*
		* 两个槽入口（在 client.ts 注册）：
		*   - `conversation.input.left`：ComposerMcpButton —— 能力工具组末尾
		*     （快捷消息 / Skills / MCP 顺序）的小锤子图标按钮；无已启用的 MCP server
		*     时空心描边，有启用时实心填充绿色（成功色）；
		*   - `conversation.input.overlay`：ComposerMcpOverlay —— InputBar 浮动
		*     锚点里的弹层，打开时以**整个能力工具组**的右上角为锚（弹层右下角贴
		*     按钮组右上角，position: fixed 视口定位；三个弹层共用同一锚点、切换时
		*     位置不跳变），容器与行样式对齐宿主 slash 菜单（MenuView）那一族设计
		*     变量，按 当前项目（.mcp.json）/ 全局（~/.dsh/mcp.json）分组列出
		*     server 名称，逐行开关直接启用/禁用。
		*
		* 两个入口是两棵独立的 React 树，开合状态用模块级微存储共享（与
		* ui-commands 的 popupSelect 同一模式：各自读 store，关闭时渲染 null）。
		*
		* 启停语义与面板的 MCP 视图一致：`api.mcp.setEnabled` 写入配置文件
		* （disabled 字段），宿主在写操作后自动重挂受影响 session 的连接——
		* 不是会话内的临时开关。
		*
		* @module @chengdb/capability-panel/client/composer-mcp
		*/
		const listeners$2 = /* @__PURE__ */ new Set();
		let openState$2 = false;
		/** 数据修订号：每次打开弹层、写操作（启用/禁用）或手动刷新时递增，按钮与弹层据此重拉。 */
		let openToken$2 = 0;
		/** 打开弹层时能力工具组的视口位置（右上角），弹层据此把右下角贴到按钮组右上角。 */
		let anchorRect$2;
		function emitChange$2() {
			for (const listener of listeners$2) try {
				listener();
			} catch {}
		}
		/** 切换（或显式设置）弹层开合；打开时 bump token 触发弹层重拉。 */
		function setComposerMcpOpen(open) {
			const next = open ?? !openState$2;
			if (next === openState$2) return;
			openState$2 = next;
			if (next) openToken$2 += 1;
			emitChange$2();
		}
		/** 数据已变化（写配置或手动刷新）：bump token，让按钮计数与弹层列表立即重拉。 */
		function refreshComposerMcp() {
			openToken$2 += 1;
			emitChange$2();
		}
		/** 记录能力工具组的视口位置（在打开弹层前调用）；紧随的 setComposerMcpOpen 会统一派发。 */
		function setComposerMcpAnchor(rect) {
			anchorRect$2 = {
				right: rect.right,
				top: rect.top
			};
		}
		/** 订阅开合状态（useState + 手动订阅，等价于 mini useSyncExternalStore）。 */
		function useComposerMcpOpen() {
			const [, force] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				const listener = () => force((n) => n + 1);
				listeners$2.add(listener);
				return () => {
					listeners$2.delete(listener);
				};
			}, []);
			return {
				open: openState$2,
				token: openToken$2,
				anchor: anchorRect$2
			};
		}
		/**
		* 小锤子图标（16px）：filled=false 空心描边，filled=true 实心填充（颜色由按钮类控制）。
		* 路径数据内联自 src/assets/锤子.svg（iconfont 实心剪影，1024 网格）。原路径由
		* 外轮廓 + 内部细节（镂空）两条子路径组成：空心态只描外轮廓（64 ≈ 16px 下的
		* 1px 线宽），避免内部细节描边显得臃肿；实心态按原文件完整填充，并附加同色
		* 同宽描边——描边以轮廓为中心向两侧各延伸一半，空心态的外缘因此比纯剪影外扩
		* 半线宽，实心态补上同样的描边后两态的外轮廓尺寸完全一致。
		*/
		const HAMMER_OUTER = "M533.617778 143.758222h163.726222a27.363556 27.363556 0 0 1 9.841778 52.906667c-84.821333 32.711111-137.671111 61.269333-167.025778 90.112-14.165333 13.937778-22.129778 27.192889-25.884444 40.448a86.471111 86.471111 0 0 0-1.137778 39.651555l1.820444 1.934223a61.496889 61.496889 0 0 1 55.466667 55.409777l309.304889 309.361778a56.32 56.32 0 0 1 0 79.701334l-50.403556 50.460444a56.32 56.32 0 0 1-79.758222 0L440.32 554.439111a61.496889 61.496889 0 0 1-55.466667-55.466667l-14.904889-14.904888-13.425777 13.482666a1.592889 1.592889 0 0 0-0.455111 1.479111l1.991111 8.305778a56.32 56.32 0 0 1-15.075556 52.736l-44.373333 44.373333a56.32 56.32 0 0 1-79.644445 0L143.985778 529.521778a56.376889 56.376889 0 0 1 0-79.701334l44.373333-44.373333a56.376889 56.376889 0 0 1 52.736-15.018667l8.305778 1.934223c0.568889 0.170667 1.137778 0 1.479111-0.398223l16.497778-16.497777a56.376889 56.376889 0 0 1 12.288-61.326223l111.502222-111.502222a201.386667 201.386667 0 0 1 142.336-58.936889z";
		function HammerIcon({ filled }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: "16",
				height: "16",
				viewBox: "0 0 1024 1024",
				"aria-hidden": "true",
				children: filled ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M533.617778 143.758222h163.726222a27.363556 27.363556 0 0 1 9.841778 52.906667c-84.821333 32.711111-137.671111 61.269333-167.025778 90.112-14.165333 13.937778-22.129778 27.192889-25.884444 40.448a86.471111 86.471111 0 0 0-1.137778 39.651555l1.820444 1.934223a61.496889 61.496889 0 0 1 55.466667 55.409777l309.304889 309.361778a56.32 56.32 0 0 1 0 79.701334l-50.403556 50.460444a56.32 56.32 0 0 1-79.758222 0L440.32 554.439111a61.496889 61.496889 0 0 1-55.466667-55.466667l-14.904889-14.904888-13.425777 13.482666a1.592889 1.592889 0 0 0-0.455111 1.479111l1.991111 8.305778a56.32 56.32 0 0 1-15.075556 52.736l-44.373333 44.373333a56.32 56.32 0 0 1-79.644445 0L143.985778 529.521778a56.376889 56.376889 0 0 1 0-79.701334l44.373333-44.373333a56.376889 56.376889 0 0 1 52.736-15.018667l8.305778 1.934223c0.568889 0.170667 1.137778 0 1.479111-0.398223l16.497778-16.497777a56.376889 56.376889 0 0 1 12.288-61.326223l111.502222-111.502222a201.386667 201.386667 0 0 1 142.336-58.936889z m36.864 54.727111h-36.920889c-38.855111 0-76.117333 15.473778-103.594667 42.951111l-111.502222 111.502223a1.592889 1.592889 0 0 0 0 2.275555l3.982222 3.982222a27.363556 27.363556 0 0 1 0 38.684445l-32.768 32.824889a56.32 56.32 0 0 1-52.736 15.075555L228.636444 443.733333a1.592889 1.592889 0 0 0-1.479111 0.455111l-44.373333 44.373334a1.592889 1.592889 0 0 0 0 2.275555l74.808889 74.808889c0.625778 0.568889 1.706667 0.568889 2.275555 0l44.373334-44.373333a1.592889 1.592889 0 0 0 0.398222-1.479111l-1.934222-8.305778a56.32 56.32 0 0 1 15.018666-52.736l32.824889-32.824889a27.363556 27.363556 0 0 1 38.684445 0l42.382222 42.382222a27.363556 27.363556 0 0 1 7.736889 23.552 6.940444 6.940444 0 0 0 1.934222 5.973334c1.649778 1.649778 3.811556 2.275556 6.030222 1.991111a27.363556 27.363556 0 0 1 23.495111 7.68l317.44 317.44c0.682667 0.682667 1.706667 0.682667 2.275556 0l50.517333-50.403556a1.592889 1.592889 0 0 0 0-2.275555l-317.44-317.496889a27.363556 27.363556 0 0 1-7.736889-23.495111 6.940444 6.940444 0 0 0-1.934222-6.030223 6.940444 6.940444 0 0 0-6.030222-1.934222 27.363556 27.363556 0 0 1-23.495111-7.736889l-15.815111-15.815111a27.363556 27.363556 0 0 1-7.281778-13.084444c-6.030222-25.6-6.599111-50.574222 0.341333-74.581334 6.826667-24.064 20.650667-45.283556 40.163556-64.455111 17.635556-17.351111 40.561778-33.564444 68.664889-49.208889z",
					fill: "currentColor",
					stroke: "currentColor",
					strokeWidth: 64,
					strokeLinejoin: "round"
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: HAMMER_OUTER,
					fill: "none",
					stroke: "currentColor",
					strokeWidth: 64,
					strokeLinejoin: "round"
				})
			});
		}
		/**
		* 小锤子图标按钮：点击开合弹层。无已启用 server 时空心描边（中性灰）；
		* 存在已启用（且未被遮蔽）的 server 时实心填充绿色（成功色，
		* skp-composer-btn-active）。计数随数据修订号重拉：挂载、弹层打开、
		* 弹层内开关切换或手动刷新后立即更新。
		*/
		function ComposerMcpButton({ api }) {
			const { open, token } = useComposerMcpOpen();
			const [enabledCount, setEnabledCount] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				let cancelled = false;
				api.mcp.list().then((list) => {
					if (!cancelled) setEnabledCount(list.servers.filter((s) => s.enabled && !s.shadowed).length);
				}).catch(() => void 0);
				return () => {
					cancelled = true;
				};
			}, [api, token]);
			const className = [
				"skp-composer-btn",
				"skp-composer-btn-mcp",
				open ? "skp-composer-btn-open" : "",
				enabledCount > 0 ? "skp-composer-btn-active" : ""
			].filter(Boolean).join(" ");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className,
				title: "MCP 服务器",
				"aria-label": "MCP 服务器",
				"aria-expanded": open,
				onClick: (event) => {
					setComposerMcpAnchor((event.currentTarget.closest(".skp-composer-tools") ?? event.currentTarget).getBoundingClientRect());
					setComposerMcpOpen();
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(HammerIcon, { filled: enabledCount > 0 })
			});
		}
		/** 挂载状态的圆点 tooltip 文案。 */
		const MOUNT_LABEL = {
			mounted: "已挂载",
			failed: "挂载失败",
			conflict: "名称冲突"
		};
		/** 复合行 id：同一个 key 可能同时存在于 project 与 global 两个作用域。 */
		function rowId(server) {
			return `${server.scope}:${server.key}`;
		}
		/**
		* MCP 快捷开关弹层：按 当前项目 / 全局 分组列出 server 名称，每行一个
		* 启用开关（状态仅保留圆点 tooltip）。打开时重拉 list + status；
		* Esc 或点击弹层外部关闭（捕获阶段 pointerdown，只关闭、不拦截该次点击）。
		*/
		function ComposerMcpOverlay({ api }) {
			const { open, token, anchor } = useComposerMcpOpen();
			const [servers, setServers] = (0, react.useState)([]);
			const [mounts, setMounts] = (0, react.useState)({});
			const [loading, setLoading] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(void 0);
			const [busyRow, setBusyRow] = (0, react.useState)(void 0);
			const [workspace, setWorkspace] = (0, react.useState)(() => api.workspaceLabel());
			const popRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => api.subscribeWorkspace(() => setWorkspace(api.workspaceLabel())), [api]);
			(0, react.useEffect)(() => {
				if (!open) return;
				let cancelled = false;
				setLoading(true);
				setError(void 0);
				Promise.all([api.mcp.list(), api.mcp.status().catch(() => [])]).then(([list, statuses]) => {
					if (cancelled) return;
					setServers(list.servers);
					const byKey = {};
					const rank = (state) => state === "conflict" ? 2 : state === "failed" ? 1 : 0;
					for (const status of statuses) for (const mount of status.servers) {
						const next = {
							state: mount.state,
							...mount.error !== void 0 ? { error: mount.error } : {}
						};
						const prev = byKey[mount.key];
						if (prev === void 0 || rank(next.state) > rank(prev.state)) byKey[mount.key] = next;
					}
					setMounts(byKey);
				}).catch((err) => {
					if (!cancelled) setError(String(err));
				}).finally(() => {
					if (!cancelled) setLoading(false);
				});
				return () => {
					cancelled = true;
				};
			}, [
				api,
				open,
				token,
				workspace
			]);
			(0, react.useEffect)(() => {
				if (!open) return;
				const onKeyDown = (event) => {
					if (event.key === "Escape") setComposerMcpOpen(false);
				};
				document.addEventListener("keydown", onKeyDown);
				return () => document.removeEventListener("keydown", onKeyDown);
			}, [open]);
			(0, react.useEffect)(() => {
				if (!open) return;
				const onPointerDown = (event) => {
					const target = event.target;
					if (!(target instanceof Node)) return;
					if (popRef.current?.contains(target) === true) return;
					if (target instanceof Element && target.closest(".skp-composer-btn-mcp") !== null) return;
					setComposerMcpOpen(false);
				};
				document.addEventListener("pointerdown", onPointerDown, true);
				return () => document.removeEventListener("pointerdown", onPointerDown, true);
			}, [open]);
			if (!open) return null;
			/** 启用/禁用：写配置文件（落盘后宿主自动重挂受影响 session），再 bump 修订号让弹层与按钮一起重拉。 */
			const onToggle = async (server) => {
				const id = rowId(server);
				setBusyRow(id);
				setError(void 0);
				const result = await api.mcp.setEnabled({
					scope: server.scope,
					key: server.key,
					enabled: !server.enabled
				});
				if (!result.ok) setError(result.errors.join("; "));
				setBusyRow(void 0);
				refreshComposerMcp();
			};
			const project = servers.filter((s) => s.scope === "project");
			const globalList = servers.filter((s) => s.scope === "global");
			const renderRow = (server) => {
				const id = rowId(server);
				const mount = mounts[server.key];
				const busy = busyRow === id;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "skp-composer-row",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: `skp-composer-dot skp-composer-dot-${mount?.state ?? "none"}`,
							title: mount === void 0 ? "未挂载到当前会话" : mount.error ?? MOUNT_LABEL[mount.state]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "skp-composer-name",
							children: server.key
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: "skp-switch",
							title: server.shadowed ? "被项目级同名条目遮蔽（切换只影响配置文件，本项目内不生效）" : server.enabled ? "点击禁用" : "点击启用",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: server.enabled,
								disabled: busy,
								onChange: () => void onToggle(server)
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "skp-switch-track" })]
						})
					]
				}, id);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: popRef,
				className: "skp-composer-pop",
				role: "dialog",
				"aria-label": "MCP 服务器",
				style: anchor === void 0 ? void 0 : {
					position: "fixed",
					left: "auto",
					right: Math.min(window.innerWidth - anchor.right, Math.max(8, window.innerWidth - 280 - 8)),
					bottom: window.innerHeight - anchor.top + 4,
					maxHeight: Math.max(120, Math.min(320, anchor.top - 12))
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "skp-composer-head",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "skp-composer-title",
							children: "MCP 服务器"
						})
					}),
					error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "skp-composer-banner",
						children: error
					}),
					loading && servers.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "skp-composer-empty",
						children: "加载中…"
					}) : servers.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "skp-composer-empty",
						children: [
							"未发现 MCP 服务器配置。",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
							"在项目 ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: ".mcp.json" }),
							" 或全局 ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: "~/.dsh/mcp.json" }),
							" 中添加 mcpServers 配置，或在能力面板中新增。"
						]
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "skp-composer-body",
						children: [project.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "skp-composer-group",
							children: "当前项目"
						}), project.map(renderRow)] }), globalList.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "skp-composer-group",
							children: "全局"
						}), globalList.map(renderRow)] })]
					})
				]
			});
		}
		//#endregion
		//#region src/client/composer-skills.tsx
		/**
		* 输入框工具行的 Skills 快捷输入。
		*
		* 两个槽入口（在 client.ts 注册）：
		*   - `conversation.input.left`：ComposerSkillsButton —— 能力工具组中间的
		*     闪电图标按钮（快捷消息 / Skills / MCP 顺序）；草稿里不含已知 `/skill`
		*     口令时空心描边，含已知口令时实心填充绿色（成功色）；
		*   - `conversation.input.overlay`：ComposerSkillsOverlay —— InputBar 浮动
		*     锚点里的弹层，打开时以**整个能力工具组**的右上角为锚（弹层右下角贴
		*     按钮组右上角，三个弹层共用同一锚点、切换时位置不跳变），容器与行样式
		*     对齐宿主 slash 菜单（MenuView）那一族设计变量，按 当前项目/全局 分组
		*     列出 user-invocable 的 skill（名称 + 描述单行省略）。
		*
		* 点击某行把 `/name ` 追加进当前会话的输入草稿并关闭弹层，随后焦点还给
		* composer 的 textarea、光标落在草稿末尾，可以直接继续输入或回车发送。
		* 插入的口令正是宿主 ui-skill 的 '/' 触发源 onPick 返回的纯文本引用形式（`{ text: '/name ' }`）：草稿里
		* 的口令由宿主渲染侧按词表扫描装饰成 chip，发送后 dsh-tool-skill 的
		* `agent/pre-step` 监听用 SKILL_GESTURE（`(^|\s)/name(?=\s|$)`）识别用户
		* 消息里的口令并注入 skill 正文（skill-invocation 上下文消息）。因此这里
		* 只需写草稿文本，不需要也不应该伪造 chip/occurrence 状态。
		*
		* 草稿读写走 session 标准套件：`conversation.input.overlay` 是 session
		* 作用域槽，ui-conversation 的 provide 贡献（hooks: ["input"]、
		* props: ["inputActions"]）会把 `useInput` / `inputActions` 注入条目
		* props；写入只调 `inputActions.setDraft(完整新草稿)`（输入机的唯一公开
		* 写路径），读取用 `useInput((s) => s.draft)` 选择器订阅。
		*
		* 两个入口是两棵独立的 React 树，开合状态用模块级微存储共享（与
		* composer-mcp 同一模式）。按钮的"草稿含 skill 口令"状态随数据修订号
		* （打开弹层）与 owner props 的 input 快照（草稿每次编辑都会重渲染
		* 工具行）更新。
		*
		* @module @chengdb/capability-panel/client/composer-skills
		*/
		const listeners$1 = /* @__PURE__ */ new Set();
		let openState$1 = false;
		/** 数据修订号：每次打开弹层或工作区变化时递增，按钮与弹层据此重拉。 */
		let openToken$1 = 0;
		/** 打开弹层时能力工具组的视口位置（右上角），弹层据此把右下角贴到按钮组右上角。 */
		let anchorRect$1;
		function emitChange$1() {
			for (const listener of listeners$1) try {
				listener();
			} catch {}
		}
		/** 切换（或显式设置）弹层开合；打开时 bump token 触发弹层重拉。 */
		function setComposerSkillsOpen(open) {
			const next = open ?? !openState$1;
			if (next === openState$1) return;
			openState$1 = next;
			if (next) openToken$1 += 1;
			emitChange$1();
		}
		/** 记录能力工具组的视口位置（在打开弹层前调用）；紧随的 setComposerSkillsOpen 会统一派发。 */
		function setComposerSkillsAnchor(rect) {
			anchorRect$1 = {
				right: rect.right,
				top: rect.top
			};
		}
		/** 订阅开合状态（useState + 手动订阅，等价于 mini useSyncExternalStore）。 */
		function useComposerSkillsOpen() {
			const [, force] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				const listener = () => force((n) => n + 1);
				listeners$1.add(listener);
				return () => {
					listeners$1.delete(listener);
				};
			}, []);
			return {
				open: openState$1,
				token: openToken$1,
				anchor: anchorRect$1
			};
		}
		/** source 是否属于"项目系"（与 panel.tsx 的口径一致：决定分组归属）。 */
		function isProjectSource(source) {
			return source === "project-dsh" || source === "project-agents" || source === "custom";
		}
		/** skill 名转正则字面量（kebab-case 本无需转义，防御未来命名放宽）。 */
		function escapeRegExp(text) {
			return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		}
		/**
		* 合并去重后的 user-invocable skill 名列表。同名条目按列表顺序取第一个
		* （roots 顺序即优先级：项目根在前、用户根在后），与宿主合并视图的
		* 赢者口径一致。
		*/
		function invocableSkills(list) {
			const seen = /* @__PURE__ */ new Set();
			const result = [];
			for (const item of list) {
				if (!item.userInvocable || seen.has(item.name)) continue;
				seen.add(item.name);
				result.push(item);
			}
			return result;
		}
		/** 草稿里是否出现已知 skill 口令（与宿主 SKILL_GESTURE 同口径）。 */
		function draftHasSkill(draft, names) {
			if (draft.length === 0 || names.length === 0) return false;
			return new RegExp(`(^|\\s)/(${names.map(escapeRegExp).join("|")})(?=\\s|$)`).test(draft);
		}
		/**
		* 闪电图标（16px）：filled=false 空心描边，filled=true 实心填充（颜色由按钮
		* 类控制）。单条闭合外轮廓、无内部细节子路径，因此空心态直接整条描边；
		* 实心态附加同色同宽描边（描边以轮廓为中心向两侧各延伸一半，补上半线宽后
		* 两态外轮廓尺寸完全一致）。strokeWidth 64 ≈ 16px 下的 1px 线宽（1024 网格）。
		*/
		const BOLT_OUTER = "M576 32L288 576h160l-32 416 320-544H576z";
		function BoltIcon({ filled }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: "16",
				height: "16",
				viewBox: "0 0 1024 1024",
				"aria-hidden": "true",
				children: filled ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: BOLT_OUTER,
					fill: "currentColor",
					stroke: "currentColor",
					strokeWidth: 64,
					strokeLinejoin: "round"
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: BOLT_OUTER,
					fill: "none",
					stroke: "currentColor",
					strokeWidth: 64,
					strokeLinejoin: "round"
				})
			});
		}
		/**
		* 闪电图标按钮：点击开合弹层。草稿不含已知 `/skill` 口令时空心描边
		* （中性灰）；含已知口令时实心填充绿色（成功色，skp-composer-btn-active）。
		* skill 名列表随数据修订号与工作区变化重拉；草稿来自 owner props 的
		* InputZone input 快照（工具行随输入机状态重渲染，无需自行订阅）。
		*/
		function ComposerSkillsButton({ api, draft }) {
			const { open, token } = useComposerSkillsOpen();
			const [names, setNames] = (0, react.useState)([]);
			const [workspace, setWorkspace] = (0, react.useState)(() => api.workspaceLabel());
			(0, react.useEffect)(() => api.subscribeWorkspace(() => setWorkspace(api.workspaceLabel())), [api]);
			(0, react.useEffect)(() => {
				let cancelled = false;
				api.skills.list().then((list) => {
					if (!cancelled) setNames(invocableSkills(list).map((s) => s.name));
				}).catch(() => void 0);
				return () => {
					cancelled = true;
				};
			}, [
				api,
				token,
				workspace
			]);
			const active = (0, react.useMemo)(() => draftHasSkill(draft, names), [draft, names]);
			const className = [
				"skp-composer-btn",
				"skp-composer-btn-skills",
				open ? "skp-composer-btn-open" : "",
				active ? "skp-composer-btn-active" : ""
			].filter(Boolean).join(" ");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className,
				title: "Skills",
				"aria-label": "Skills",
				"aria-expanded": open,
				onClick: (event) => {
					setComposerSkillsAnchor((event.currentTarget.closest(".skp-composer-tools") ?? event.currentTarget).getBoundingClientRect());
					setComposerSkillsOpen();
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BoltIcon, { filled: active })
			});
		}
		/**
		* Skills 快捷输入弹层：按 当前项目/全局 分组列出 user-invocable 的 skill，
		* 顶部一个过滤输入框；点击某行把 `/name ` 追加进草稿并关闭弹层。
		* 打开时重拉列表；Esc 或点击弹层外部关闭（捕获阶段 pointerdown，只关闭、
		* 不拦截该次点击）。
		*/
		function ComposerSkillsOverlay({ api, useInput, inputActions }) {
			const { open, token, anchor } = useComposerSkillsOpen();
			const [skills, setSkills] = (0, react.useState)([]);
			const [loading, setLoading] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(void 0);
			const [query, setQuery] = (0, react.useState)("");
			const [workspace, setWorkspace] = (0, react.useState)(() => api.workspaceLabel());
			const popRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => api.subscribeWorkspace(() => setWorkspace(api.workspaceLabel())), [api]);
			(0, react.useEffect)(() => {
				if (!open) {
					setQuery("");
					return;
				}
				let cancelled = false;
				setLoading(true);
				setError(void 0);
				api.skills.list().then((list) => {
					if (!cancelled) setSkills(invocableSkills(list));
				}).catch((err) => {
					if (!cancelled) setError(String(err));
				}).finally(() => {
					if (!cancelled) setLoading(false);
				});
				return () => {
					cancelled = true;
				};
			}, [
				api,
				open,
				token,
				workspace
			]);
			(0, react.useEffect)(() => {
				if (!open) return;
				const onKeyDown = (event) => {
					if (event.key === "Escape") setComposerSkillsOpen(false);
				};
				document.addEventListener("keydown", onKeyDown);
				return () => document.removeEventListener("keydown", onKeyDown);
			}, [open]);
			(0, react.useEffect)(() => {
				if (!open) return;
				const onPointerDown = (event) => {
					const target = event.target;
					if (!(target instanceof Node)) return;
					if (popRef.current?.contains(target) === true) return;
					if (target instanceof Element && target.closest(".skp-composer-btn-skills") !== null) return;
					setComposerSkillsOpen(false);
				};
				document.addEventListener("pointerdown", onPointerDown, true);
				return () => document.removeEventListener("pointerdown", onPointerDown, true);
			}, [open]);
			if (!open) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillsPop, {
				anchor,
				popRef,
				skills,
				loading,
				error,
				query,
				setQuery,
				useInput,
				inputActions
			});
		}
		/**
		* 弹层实体（仅在打开时挂载）：在这里调用 useInput 订阅草稿，保证每次渲染
		* 的钩子调用序列一致。
		*/
		function SkillsPop({ anchor, popRef, skills, loading, error, query, setQuery, useInput, inputActions }) {
			const draft = typeof useInput === "function" ? useInput((s) => typeof s?.draft === "string" ? s.draft : "") : "";
			const canInsert = typeof inputActions?.setDraft === "function";
			/**
			* 从弹层自身向上找 composer 的 textarea：弹层锚点挂在 InputBar 子树内，
			* 逐级向上取第一个包含 textarea 的祖先即 composer 卡片。相对自身元素的
			* 作用域查询（只按标签名，不依赖宿主类名），比全局选择器稳健。
			*/
			const findComposerTextarea = () => {
				let node = popRef.current?.parentElement ?? null;
				while (node !== null) {
					const textarea = node.querySelector("textarea");
					if (textarea instanceof HTMLTextAreaElement) return textarea;
					node = node.parentElement;
				}
			};
			/** 把 `/name ` 追加到草稿末尾（必要时补一个分隔空格），关闭弹层并把焦点还给输入框。 */
			const onPick = (skill) => {
				if (!canInsert) return;
				const textarea = findComposerTextarea();
				const separator = draft.length > 0 && !/\s$/.test(draft) ? " " : "";
				inputActions.setDraft(`${draft}${separator}/${skill.name} `);
				setComposerSkillsOpen(false);
				if (textarea !== void 0) requestAnimationFrame(() => {
					textarea.focus();
					const end = textarea.value.length;
					textarea.setSelectionRange(end, end);
				});
			};
			const keyword = query.trim().toLowerCase();
			const filtered = keyword.length === 0 ? skills : skills.filter((s) => s.name.toLowerCase().includes(keyword) || (s.description ?? "").toLowerCase().includes(keyword));
			const project = filtered.filter((s) => isProjectSource(s.source));
			const globalList = filtered.filter((s) => !isProjectSource(s.source));
			const renderRow = (skill) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: "skp-composer-skill",
				disabled: !canInsert,
				title: canInsert ? `输入 /${skill.name}` : "当前会话不支持快速输入",
				onClick: () => onPick(skill),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "skp-composer-skill-name",
					children: skill.name
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "skp-composer-skill-desc",
					children: skill.description
				})]
			}, skill.name);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: popRef,
				className: "skp-composer-pop skp-composer-pop-skills",
				role: "dialog",
				"aria-label": "Skills",
				style: anchor === void 0 ? void 0 : {
					position: "fixed",
					left: "auto",
					right: Math.min(window.innerWidth - anchor.right, Math.max(8, window.innerWidth - 280 - 8)),
					bottom: window.innerHeight - anchor.top + 4,
					maxHeight: Math.max(120, Math.min(320, anchor.top - 12))
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "skp-composer-head",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "skp-composer-title",
							children: "Skills"
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						className: "skp-composer-search",
						type: "search",
						placeholder: "搜索 skill…",
						value: query,
						onChange: (event) => setQuery(event.currentTarget.value)
					}),
					error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "skp-composer-banner",
						children: error
					}),
					loading && skills.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "skp-composer-empty",
						children: "加载中…"
					}) : filtered.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "skp-composer-empty",
						children: skills.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							"未发现可输入的 skill。",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
							"在项目 ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: ".dsh/skills" }),
							" 或全局 ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: "~/.dsh/skills" }),
							" 中添加，或在能力面板中安装。"
						] }) : "没有匹配项。"
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "skp-composer-body",
						children: [project.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "skp-composer-group",
							children: "当前项目"
						}), project.map(renderRow)] }), globalList.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "skp-composer-group",
							children: "全局"
						}), globalList.map(renderRow)] })]
					})
				]
			});
		}
		//#endregion
		//#region src/client/composer-quick.tsx
		/**
		* 输入框工具行的快捷消息入口。
		*
		* 两个槽入口（在 client.ts 注册）：
		*   - `conversation.input.left`：ComposerQuickButton —— 聊天气泡图标按钮，
		*     排在能力工具组最前（快捷消息 / Skills / MCP，与面板域 Tab 顺序一致）；
		*     图标恒为空心描边（中性灰），不做启用态实心/变绿——快捷消息没有
		*     "草稿里已触发"或"存在已启用"这类需要聚合信号；
		*   - `conversation.input.overlay`：ComposerQuickOverlay —— InputBar 浮动
		*     锚点里的弹层，打开时以**整个能力工具组**的右上角为锚（弹层右下角贴
		*     按钮组右上角，三个弹层共用同一锚点、切换时位置不跳变），容器与
		*     行样式对齐宿主 slash 菜单（MenuView）那一族设计变量，按
		*     当前项目/全局 分组列出**已启用**的快捷消息（名称 + 正文单行省略），
		*     顶部一个过滤输入框。
		*
		* 点击某行把该消息的正文追加到当前会话的输入草稿并关闭弹层，随后焦点还
		* 给 composer 的 textarea、光标落在草稿末尾，可以直接继续输入或回车发送。
		* 行右侧还有一个 hover / 键盘聚焦时浮现的小按钮（与宿主主发送键同款向上
		* 箭头图标，28×28 方形圆角）：一键把该消息正文作为完整内容直接发送——先
		* `setDraft` 覆盖草稿、再 `submit()` 进入宿主提交流水线，不再经过输入框
		* 草稿。
		* 快捷消息是纯文本（可多行），不像 skills 那样走 `/名称 ` 口令——正文里
		* 若包含 `/skill` 形式的口令，宿主仍会照常渲染成 chip（草稿渲染按词表
		* 扫描），这里不做任何特殊处理。
		*
		* 草稿读写走 session 标准套件：`conversation.input.overlay` 是 session
		* 作用域槽，ui-conversation 的 provide 贡献（hooks: ["input"]、
		* props: ["inputActions"]）会把 `useInput` / `inputActions` 注入条目
		* props；追加草稿只调 `inputActions.setDraft(完整新草稿)`，直接发送在
		* `setDraft` 之后调 `inputActions.submit()`（把当前草稿送进宿主提交流水线），
		* 读取用 `useInput((s) => s.draft)` 选择器订阅。
		*
		* 两个入口是两棵独立的 React 树，开合状态用模块级微存储共享（与
		* composer-mcp / composer-skills 同一模式）。按钮无需拉取任何数据
		* （图标恒为空心，弹层打开时才按数据修订号与工作区变化重拉列表）。
		*
		* @module @chengdb/capability-panel/client/composer-quick
		*/
		const listeners = /* @__PURE__ */ new Set();
		let openState = false;
		/** 数据修订号：每次打开弹层时递增，弹层据此重拉列表（按钮不依赖数据）。 */
		let openToken = 0;
		/** 打开弹层时能力工具组的视口位置（右上角），弹层据此把右下角贴到按钮组右上角。 */
		let anchorRect;
		function emitChange() {
			for (const listener of listeners) try {
				listener();
			} catch {}
		}
		/** 切换（或显式设置）弹层开合；打开时 bump token 触发弹层重拉。 */
		function setComposerQuickOpen(open) {
			const next = open ?? !openState;
			if (next === openState) return;
			openState = next;
			if (next) openToken += 1;
			emitChange();
		}
		/** 记录能力工具组的视口位置（在打开弹层前调用）；紧随的 setComposerQuickOpen 会统一派发。 */
		function setComposerQuickAnchor(rect) {
			anchorRect = {
				right: rect.right,
				top: rect.top
			};
		}
		/** 订阅开合状态（useState + 手动订阅，等价于 mini useSyncExternalStore）。 */
		function useComposerQuickOpen() {
			const [, force] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				const listener = () => force((n) => n + 1);
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			}, []);
			return {
				open: openState,
				token: openToken,
				anchor: anchorRect
			};
		}
		/**
		* 聊天气泡图标（16px）：恒为空心描边（颜色由按钮类控制）。单条闭合外轮廓
		* （气泡 + 左下角尾巴）、无内部细节子路径，因此整条描边即可。strokeWidth 64
		* ≈ 16px 下的 1px 线宽（1024 网格）。按钮不做实心填充态（见 ComposerQuickButton）。
		*/
		const BUBBLE_OUTER = "M192 256h640a96 96 0 0 1 96 96v256a96 96 0 0 1-96 96H448l-160 128v-128h-96a96 96 0 0 1-96-96V352a96 96 0 0 1 96-96z";
		function BubbleIcon() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: "16",
				height: "16",
				viewBox: "0 0 1024 1024",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: BUBBLE_OUTER,
					fill: "none",
					stroke: "currentColor",
					strokeWidth: 64,
					strokeLinejoin: "round"
				})
			});
		}
		/** 发送（向上箭头）图标（16px）：与宿主主发送键同款路径（16×16 viewBox，纯填充）。 */
		const SEND_PATH = "M8.3125 0.980183C8.66767 1.0531 8.97902 1.20418 9.2627 1.43233C9.48724 1.61297 9.73029 1.85793 9.97949 2.10714L14.707 6.83468L13.293 8.24874L9 3.95577V15.0417H7V3.95577L2.70703 8.24874L1.29297 6.83468L6.02051 2.10714C6.26971 1.85793 6.51277 1.61297 6.7373 1.43233C6.97662 1.23986 7.28445 1.04402 7.6875 0.980183C7.8973 0.947006 8.1031 0.95516 8.3125 0.980183Z";
		function SendIcon() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: "16",
				height: "16",
				viewBox: "0 0 16 16",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: SEND_PATH,
					fill: "currentColor"
				})
			});
		}
		/**
		* 聊天气泡按钮：点击开合弹层。图标恒为空心描边（中性灰），不做启用态
		* 实心/变绿（skp-composer-btn-active）；打开时仅由按钮自身类切换背景与
		* 品牌色（skp-composer-btn-open）。无需拉取数据列表。
		*/
		function ComposerQuickButton() {
			const { open } = useComposerQuickOpen();
			const className = [
				"skp-composer-btn",
				"skp-composer-btn-quick",
				open ? "skp-composer-btn-open" : ""
			].filter(Boolean).join(" ");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className,
				title: "快捷消息",
				"aria-label": "快捷消息",
				"aria-expanded": open,
				onClick: (event) => {
					setComposerQuickAnchor((event.currentTarget.closest(".skp-composer-tools") ?? event.currentTarget).getBoundingClientRect());
					setComposerQuickOpen();
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BubbleIcon, {})
			});
		}
		/** 服务是否属于"项目系"（与面板的分组口径一致）。 */
		function isProjectScope(scope) {
			return scope === "project";
		}
		/**
		* 快捷消息弹层：按 当前项目/全局 分组列出**已启用**的快捷消息，
		* 顶部一个过滤输入框；点击某行把正文追加进草稿并关闭弹层。
		* 打开时重拉列表；Esc 或点击弹层外部关闭（捕获阶段 pointerdown，只关闭、
		* 不拦截该次点击）。
		*/
		function ComposerQuickOverlay({ api, useInput, inputActions }) {
			const { open, token, anchor } = useComposerQuickOpen();
			const [messages, setMessages] = (0, react.useState)([]);
			const [loading, setLoading] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(void 0);
			const [query, setQuery] = (0, react.useState)("");
			const [workspace, setWorkspace] = (0, react.useState)(() => api.workspaceLabel());
			const popRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => api.subscribeWorkspace(() => setWorkspace(api.workspaceLabel())), [api]);
			(0, react.useEffect)(() => {
				if (!open) {
					setQuery("");
					return;
				}
				let cancelled = false;
				setLoading(true);
				setError(void 0);
				api.quickMessages.list().then((list) => {
					if (!cancelled) setMessages(list.messages.filter((m) => m.enabled));
				}).catch((err) => {
					if (!cancelled) setError(String(err));
				}).finally(() => {
					if (!cancelled) setLoading(false);
				});
				return () => {
					cancelled = true;
				};
			}, [
				api,
				open,
				token,
				workspace
			]);
			(0, react.useEffect)(() => {
				if (!open) return;
				const onKeyDown = (event) => {
					if (event.key === "Escape") setComposerQuickOpen(false);
				};
				document.addEventListener("keydown", onKeyDown);
				return () => document.removeEventListener("keydown", onKeyDown);
			}, [open]);
			(0, react.useEffect)(() => {
				if (!open) return;
				const onPointerDown = (event) => {
					const target = event.target;
					if (!(target instanceof Node)) return;
					if (popRef.current?.contains(target) === true) return;
					if (target instanceof Element && target.closest(".skp-composer-btn-quick") !== null) return;
					setComposerQuickOpen(false);
				};
				document.addEventListener("pointerdown", onPointerDown, true);
				return () => document.removeEventListener("pointerdown", onPointerDown, true);
			}, [open]);
			if (!open) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuickPop, {
				anchor,
				popRef,
				messages,
				loading,
				error,
				query,
				setQuery,
				useInput,
				inputActions
			});
		}
		/**
		* 弹层实体（仅在打开时挂载）：在这里调用 useInput 订阅草稿，保证每次渲染
		* 的钩子调用序列一致。
		*/
		function QuickPop({ anchor, popRef, messages, loading, error, query, setQuery, useInput, inputActions }) {
			const draft = typeof useInput === "function" ? useInput((s) => typeof s?.draft === "string" ? s.draft : "") : "";
			const phase = typeof useInput === "function" ? useInput((s) => typeof s?.phase === "string" ? s.phase : "") : "";
			const machineBusy = phase === "adjudicating" || phase === "submitting";
			const canInsert = typeof inputActions?.setDraft === "function";
			const canSend = canInsert && typeof inputActions?.submit === "function" && !machineBusy;
			/**
			* 从弹层自身向上找 composer 的 textarea：弹层锚点挂在 InputBar 子树内，
			* 逐级向上取第一个包含 textarea 的祖先即 composer 卡片。相对自身元素的
			* 作用域查询（只按标签名，不依赖宿主类名），比全局选择器稳健。
			*/
			const findComposerTextarea = () => {
				let node = popRef.current?.parentElement ?? null;
				while (node !== null) {
					const textarea = node.querySelector("textarea");
					if (textarea instanceof HTMLTextAreaElement) return textarea;
					node = node.parentElement;
				}
			};
			/** 把快捷消息的正文追加到草稿末尾（必要时补一个分隔空格），关闭弹层并把焦点还给输入框。 */
			const onPick = (message) => {
				if (!canInsert) return;
				const textarea = findComposerTextarea();
				const separator = draft.length > 0 && !/\s$/.test(draft) ? " " : "";
				inputActions.setDraft(`${draft}${separator}${message.text}`);
				setComposerQuickOpen(false);
				if (textarea !== void 0) requestAnimationFrame(() => {
					textarea.focus();
					const end = textarea.value.length;
					textarea.setSelectionRange(end, end);
				});
			};
			/** 把快捷消息的正文作为完整内容直接发送（先覆盖草稿、再提交进宿主提交流水线），并关闭弹层。 */
			const onSend = (message) => {
				if (!canSend) return;
				inputActions.setDraft(message.text);
				setComposerQuickOpen(false);
				inputActions.submit();
			};
			const keyword = query.trim().toLowerCase();
			const filtered = keyword.length === 0 ? messages : messages.filter((m) => m.name.toLowerCase().includes(keyword) || m.text.toLowerCase().includes(keyword));
			const project = filtered.filter((m) => isProjectScope(m.scope));
			const globalList = filtered.filter((m) => !isProjectScope(m.scope));
			const renderRow = (message) => {
				const sendLabel = draft.trim() === "" ? `直接发送「${message.name}」` : `覆盖当前草稿并直接发送「${message.name}」`;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "skp-composer-quick-row",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "skp-composer-quick-pick",
						disabled: !canInsert,
						title: canInsert ? `输入「${message.name}」` : "当前会话不支持快速输入",
						onClick: () => onPick(message),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "skp-composer-skill-name",
							children: message.name
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "skp-composer-skill-desc",
							children: message.text
						})]
					}), canSend && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "skp-composer-quick-send",
						title: sendLabel,
						"aria-label": sendLabel,
						onClick: () => onSend(message),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SendIcon, {})
					})]
				}, `${message.scope}:${message.name}`);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: popRef,
				className: "skp-composer-pop skp-composer-pop-quick",
				role: "dialog",
				"aria-label": "快捷消息",
				style: anchor === void 0 ? void 0 : {
					position: "fixed",
					left: "auto",
					right: Math.min(window.innerWidth - anchor.right, Math.max(8, window.innerWidth - 280 - 8)),
					bottom: window.innerHeight - anchor.top + 4,
					maxHeight: Math.max(120, Math.min(320, anchor.top - 12))
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "skp-composer-head",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "skp-composer-title",
							children: "快捷消息"
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						className: "skp-composer-search",
						type: "search",
						placeholder: "搜索快捷消息…",
						value: query,
						onChange: (event) => setQuery(event.currentTarget.value)
					}),
					error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "skp-composer-banner",
						children: error
					}),
					loading && messages.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "skp-composer-empty",
						children: "加载中…"
					}) : filtered.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "skp-composer-empty",
						children: messages.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							"未发现快捷消息。",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
							"在能力面板的「快捷消息」域中新增。"
						] }) : "没有匹配项。"
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "skp-composer-body",
						children: [project.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "skp-composer-group",
							children: "当前项目"
						}), project.map(renderRow)] }), globalList.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "skp-composer-group",
							children: "全局"
						}), globalList.map(renderRow)] })]
					})
				]
			});
		}
		//#endregion
		//#region src/client.ts
		/**
		* capability-panel 的客户端插件入口。
		*
		* 发布后的 bundle 会把本模块包裹进
		* `window.__ModuleLoader__.load({ id, factory })`（由 tsdown 生成，平台模块
		* 外部化）；这里的源码只导出 `inject` 与 `apply`。
		*
		* 面板入口位于**侧栏底部**：向根作用域的 `sidebar.footer.action` 列表槽
		* （kind `list`、replace-risk `none`）注册一个按钮，摆放在 Settings 旁边；
		* 点击后在其上方弹出锚定浮层面板。纯增量——不遮蔽任何内置 UI，也不绑定
		* 任何 session。
		*
		* @module @chengdb/capability-panel/client
		*/
		/** locale 字典的命名空间。 */
		const NS = "capabilityPanel";
		/**
		* 简体中文词典。
		* 注意：当前面板组件直接使用硬编码文案（见 panel.tsx / mcp-panel.tsx 与
		* scope-tabs.ts），这组 dictionary 注册后暂无组件读取，属于后续接入本地化的
		* 预留脚手架，两边内容暂时一致。
		*/
		const zh = {
			"panel.title": "能力面板",
			"panel.domain.skills": "技能",
			"panel.domain.mcp": "MCP",
			"panel.scope.all": "全部",
			"panel.scope.project": "项目",
			"panel.scope.global": "全局",
			"panel.search": "搜索…",
			"panel.loading": "加载中…",
			"panel.empty": "没有匹配项。",
			"panel.readonly": "只读",
			"panel.none": "（无工作区）"
		};
		/** 英文词典，键集合与 zh 完全一致（类型上互相约束，防止漏键）。 */
		const en = {
			"panel.title": "Capabilities",
			"panel.domain.skills": "Skills",
			"panel.domain.mcp": "MCP",
			"panel.scope.all": "All",
			"panel.scope.project": "Project",
			"panel.scope.global": "Global",
			"panel.search": "Search…",
			"panel.loading": "Loading…",
			"panel.empty": "Nothing matches.",
			"panel.readonly": "Read-only",
			"panel.none": "(no workspace)"
		};
		/** 客户端强依赖的服务。 */
		const inject = [
			"connection",
			"slots",
			"locale",
			"workspaces"
		];
		/**
		* 客户端插件主体：注入样式、注册 locale、构造传输适配器、注册侧栏入口。
		*/
		function apply(ctx) {
			const disposers = [];
			disposers.push(installStyles());
			if (ctx.locale?.register) disposers.push(ctx.locale.register(NS, {
				zh,
				en
			}));
			const workspaceListeners = /* @__PURE__ */ new Set();
			const notifyWorkspaceListeners = () => {
				for (const listener of workspaceListeners) try {
					listener();
				} catch {}
			};
			const selection = { cwd: void 0 };
			const api = createPanelApi({
				rpc: ctx.get("connection")?.rpc,
				currentWorkspaceCwd: () => selection.cwd ?? currentWorkspaceCwd(ctx),
				subscribeWorkspace: (listener) => {
					workspaceListeners.add(listener);
					return () => {
						workspaceListeners.delete(listener);
					};
				},
				listProjects: () => listWorkspaceOptions(ctx),
				selectedProject: () => selection.cwd,
				selectProject: (path) => {
					if (selection.cwd === path) return;
					selection.cwd = path;
					notifyWorkspaceListeners();
				}
			});
			let lastCwd = selection.cwd ?? currentWorkspaceCwd(ctx);
			let lastItemsKey = workspaceItemsKey(ctx);
			const onGraphChange = () => {
				const next = selection.cwd ?? currentWorkspaceCwd(ctx);
				const itemsKey = workspaceItemsKey(ctx);
				if (next === lastCwd && itemsKey === lastItemsKey) return;
				lastCwd = next;
				lastItemsKey = itemsKey;
				notifyWorkspaceListeners();
			};
			const unsubSessions = ctx.get("sessions")?.list?.subscribe?.(onGraphChange);
			const unsubWorkspaces = ctx.get("workspaces")?.list?.subscribe?.(onGraphChange);
			if (typeof unsubSessions === "function") disposers.push(unsubSessions);
			if (typeof unsubWorkspaces === "function") disposers.push(unsubWorkspaces);
			if (ctx.slots?.inject && ctx.slots.register) {
				const dispose = ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
					name: "sidebar.footer.action",
					id: "capability-panel",
					order: 10,
					label: "能力面板"
				}, (props) => CapabilitiesFooterAction({
					api,
					wide: props?.wide !== false
				})));
				if (typeof dispose === "function") disposers.push(dispose);
			}
			if (ctx.slots?.inject && ctx.slots.register) {
				const disposeTools = ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
					name: "conversation.input.left",
					id: "capability-panel-tools",
					order: 10,
					label: "能力工具"
				}, (props) => (0, react.createElement)("div", { className: "skp-composer-tools" }, ComposerQuickButton(), ComposerSkillsButton({
					api,
					draft: typeof props?.input?.draft === "string" ? props.input.draft : ""
				}), ComposerMcpButton({ api }))));
				if (typeof disposeTools === "function") disposers.push(disposeTools);
				const disposeSkillsOverlay = ctx.slots.inject("conversation.input.overlay", () => ctx.slots.register({
					name: "conversation.input.overlay",
					id: "capability-panel-skills",
					order: 5,
					label: "Skills"
				}, (props) => ComposerSkillsOverlay({
					api,
					useInput: typeof props?.useInput === "function" ? props.useInput : void 0,
					inputActions: typeof props?.inputActions?.setDraft === "function" ? props.inputActions : void 0
				})));
				if (typeof disposeSkillsOverlay === "function") disposers.push(disposeSkillsOverlay);
				const disposeQuickOverlay = ctx.slots.inject("conversation.input.overlay", () => ctx.slots.register({
					name: "conversation.input.overlay",
					id: "capability-panel-quick",
					order: 7,
					label: "快捷消息"
				}, (props) => ComposerQuickOverlay({
					api,
					useInput: typeof props?.useInput === "function" ? props.useInput : void 0,
					inputActions: typeof props?.inputActions?.setDraft === "function" ? props.inputActions : void 0
				})));
				if (typeof disposeQuickOverlay === "function") disposers.push(disposeQuickOverlay);
				const disposeOverlay = ctx.slots.inject("conversation.input.overlay", () => ctx.slots.register({
					name: "conversation.input.overlay",
					id: "capability-panel-mcp",
					order: 10,
					label: "MCP 服务器"
				}, () => ComposerMcpOverlay({ api })));
				if (typeof disposeOverlay === "function") disposers.push(disposeOverlay);
			}
			ctx.effect?.(() => () => {
				for (const dispose of disposers) dispose();
			}, "capability-panel: client");
		}
		/**
		* 推导当前活动的工作区目录（若存在）。
		*
		* 最高保真来源是当前 session 自己的工作目录（`sessions.list` →
		* `byId[current].cwd`）；session 存在但还没有 cwd 时，回退到包含它的
		* Workspace；没有当前 session 时（例如从 hero 屏打开设置）用最近活跃的
		* workspace，再退到第一个注册的 workspace。
		*
		* 注意：workspaces 快照在 `workspaces.list`（SnapshotStore）上——服务本身
		* 没有 getSnapshot，且没有 `current` 字段；它暴露 `items` /
		* `recentWorkspaceId` / `baselinesReady`。
		*/
		function currentWorkspaceCwd(ctx) {
			let current;
			try {
				const snap = ctx.get("sessions")?.list?.getSnapshot?.();
				current = snap?.current;
				if (typeof current === "string") {
					const cwd = snap?.byId?.[current]?.cwd;
					if (typeof cwd === "string" && cwd.length > 0) return cwd;
				}
			} catch {}
			try {
				const workspaces = ctx.get("workspaces");
				const items = workspaces?.list?.getSnapshot?.()?.items ?? [];
				if (typeof current === "string") {
					const owned = items.find((w) => w.sessionIds?.includes?.(current));
					if (owned?.path) return owned.path;
				}
				const recent = workspaces?.list?.getSnapshot?.()?.recentWorkspaceId;
				if (typeof recent === "string") {
					const item = items.find((w) => w.workspaceId === recent);
					if (item?.path) return item.path;
				}
				return items[0]?.path;
			} catch {
				return;
			}
		}
		/** 读取已知工作区，供面板的项目下拉框使用。 */
		function listWorkspaceOptions(ctx) {
			try {
				return (ctx.get("workspaces")?.list?.getSnapshot?.()?.items ?? []).filter((w) => typeof w.path === "string" && w.path.length > 0).map((w) => ({
					id: String(w.workspaceId ?? w.path),
					path: w.path,
					...typeof w.title === "string" && w.title.length > 0 ? { title: w.title } : {}
				}));
			} catch {
				return [];
			}
		}
		/** 工作区列表的廉价变更检测键（用于判断是否需要刷新下拉框）。 */
		function workspaceItemsKey(ctx) {
			return listWorkspaceOptions(ctx).map((o) => `${o.id}:${o.path}:${o.title ?? ""}`).join("|");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map