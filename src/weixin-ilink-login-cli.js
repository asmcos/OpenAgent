/**
 * 仅执行微信 iLink 扫码登录并写入 ~/.openagent/weixin-ilink.json
 * 运行：npm run weixin-login
 */
import 'dotenv/config';
import { runInteractiveQrLogin } from './lib/weixinIlinkLogin.js';

try {
  await runInteractiveQrLogin({});
  process.exit(0);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
