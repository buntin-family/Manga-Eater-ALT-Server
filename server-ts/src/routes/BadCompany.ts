/**
 * @fileoverview BadCompany router
 * @file router for BadCompany Client on Cloudflare Workers
 */

import express from 'express';
import { Discord, loadConf, respondInteraction } from './utils';
const BadCompanyRouter = express.Router();

BadCompanyRouter.use((req, res, next) => {
  let d = new Date();
  let date = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}(${
    ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
  })${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`.replace(/\n|\r/g, '');
  console.log(`BadCompany router: ${date}`);
  next();
});

BadCompanyRouter.get('/', (req, res) => {
  const ssm = req.ssm;
  const outDir = req.outdir;
  res.send('BadCompany router');
});

BadCompanyRouter.get('/query', (req, res) => {
  const ssm = req.ssm;
  const outDir = req.outdir;
  res.send('BadCompany router query');
});

BadCompanyRouter.post('/', async (req, res) => {
  const config: Config = loadConf();
  const discord = await new Discord(config).login();
  const ssm = req.ssm;
  const outDir = req.outdir;
  const bch = req.bchelper;
  const body: BC_GeneralPayload = req.body;
  const type = body.type;
  const ev = body.eventInfo;
  const data = body.data;
  //check guild id and channel id is valid
  const access = await discord.checkIdAvailability(ev.guild_id, ev.channel_id);
  const ifPush = type.includes('push');
  if (access === 0) {
    let msg = 'Request has ben approved. wait a minute...';
    if (ifPush) {
      msg += '\nこのチャンネルにfetchされます。';
    }
    respondInteraction(ev.app_id, ev.token, { content: msg });
    //処理を投げる。
    const url = data.url as string;
    bch.addTask(url, ev.channel_id, type);
  } else if (access === 1) {
    respondInteraction(ev.app_id, ev.token, {
      content: `Access denied. Bot cannot Access The Server. \nInviteURL:${discord.genInviteLink()}`,
    });
  } else {
    respondInteraction(ev.app_id, ev.token, {
      content: `Access denied. Bot cannot Access The Channel. \nCheck the channel permissions.\n${JSON.stringify(
        body,
        null,
        2
      )}`,
    });
  }
  res.send('BadCompany router post');
});

BadCompanyRouter.post('/get', async (req, res) => {
  console.log('BC POST /get');
  const ssm = req.ssm;
  const outDir = req.outdir;
  const bch = req.bchelper;
  const discord = await Discord.gen();
  const body: BC_GeneralPayload = req.body;
  const type = body.type;
  const ev = body.eventInfo;
  const data = body.data;
  const access = await discord.checkIdAvailability(ev.guild_id, ev.channel_id);
  if (access === 0) {
    const msg =
      '[ME-Server] query has been fullfilled.\n' +
      JSON.stringify(data, null, 2);
    respondInteraction(ev.app_id, ev.token, { content: msg });
  } else {
    respondInteraction(ev.app_id, ev.token, {
      content: `Access denied. Bot cannot Access The Channel. \nCheck the channel permissions.\n${JSON.stringify(
        body,
        null,
        2
      )}`,
    });
  }
});

export default BadCompanyRouter;
