# 安全策略 / Security Policy

## 报告漏洞

请**不要**在公开的 Issue 里报告安全问题。请通过 GitHub 的私密漏洞报告提交：
[Report a vulnerability](https://github.com/foodsaid/QRprint/security/advisories/new)

请尽量附上：问题描述、复现步骤（例如构造的表格文件）、可能的影响。

Please report vulnerabilities privately via
[GitHub Security Advisories](https://github.com/foodsaid/QRprint/security/advisories/new), not in public issues.

## 支持的版本

只维护最新版本（GitHub Pages 上的页面即为最新版）。

## 范围

QRprint 是单文件、纯浏览器的工具，表格只在本机浏览器里处理，页面用 CSP 禁止一切网络请求。
已采取的防护（零 `innerHTML` 写入 + Trusted Types、原型污染防护、单元格展开预算等）见
[README 的技术细节](README.md#数据安全)。以下情况属于已知限制，不按漏洞处理：

- 页面可被嵌入 iframe（GitHub Pages 无法设置 `frame-ancestors` 响应头）
- 单文件方案要求 `script-src 'unsafe-inline'`
- 60 MB 上限内的压缩炸弹（属自伤：你自己选择打开的文件）
