import express, { Application, Request, Response } from 'express';
import { Server } from 'socket.io';
import http from 'http';
import fs from 'fs';
import path from 'path';
import * as utils from './scrapeUtils';
import type { Config, DirectoryOutbound, Checked } from './scrapeUtils';
import Discord from './Discord';
import ServerStatusManager from './ServerStatusManager';
//jobs id set

console.log('Manga Eater Server is Starting...\nThis is a index.ts');

const app: Application = express();
const PORT = 11150;

//const outDir = '/filerun/user-files/out';
const outDir = './out';

const allowCrossDomain = (
  req: Request,
  res: Response,
  next: Function
): void => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
  res.header(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, access_token'
  );
  if ('OPTIONS' === req.method) {
    res.sendStatus(200);
  } else {
    next();
  }
};

app.use(allowCrossDomain);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static('./page/build'));

/* Main Process */
app.post('/', async (req: Request, res: Response) => {
  const config = utils.loadConf<Config>();
  const { urls, title, ifPush } = req.body;
  let processId = ssm.createFetchJob();
  ssm.setJobsTitle(processId, title);
  ssm.setJobsProgress(processId, 'Analyzing...');
  const titleAndEpisode: string = title;
  const titleAndEpisodeArr = titleAndEpisode.split('-');
  const titleName = titleAndEpisodeArr[0];
  const episode = titleAndEpisodeArr[1];
  const paddedEpisode = utils.padZero(episode);
  const directory = path.join(outDir, titleName, paddedEpisode);
  const timebound = 100;
  const filenames = utils.generateOrderFilenames(urls);
  await utils.downloadImagesWithSSM(
    urls,
    filenames,
    timebound,
    directory,
    ssm,
    processId
  );
  console.log(ifPush);
  if (ifPush) {
    processId = ssm.switchJob(processId);
    ssm.setJobsProgress(processId, 'Pushing... (Preparing)');
    const discord = new Discord(config);
    await discord.login();
    await discord.sendFilesWithSSM(directory, title, 500, ssm, processId);
    discord.killClient();
  } else {
    console.log('No Push');
  }
  ssm.removeJob(processId);
  res.send('Download Complete');
});

/**
 * チャプターURLから画像をDLし、ifPushがtrueならdiscordに送信する
 * @param url {string} mangarawjp.ioのチャプターurl
 * @param ifPush
 */
const dlHelperFromURL = async (
  url: string,
  ifPush: boolean,
  processId: string
) => {
  const { directory: dir, threadName: title } = await utils.scrapeFromUrl(
    url,
    outDir
  );
  if (ifPush) {
    const config = utils.loadConf<Config>();
    const discord = new Discord(config);
    await discord.login();
    processId = ssm.switchJob(processId);
    ssm.setJobsTitle(processId, title);
    ssm.setJobsProgress(processId, 'Pushing... (Preparing)');
    await discord.sendFilesWithSSM(dir, title, 500, ssm, processId);
  }
  return dir;
};

//urlからダウンロード
app.post('/url', async (req: Request, res: Response) => {
  try {
    console.log('req.body :', req.body);
    const { url, ifPush } = req.body;
    const urlString = url as string;
    let processId = ssm.createFetchJob();
    if (urlString.includes('chapter')) {
      //URLがチャプターURLの場合
      await dlHelperFromURL(url, ifPush, processId);
    } else {
      //URLがタイトルURLの場合
      ssm.setJobsTitle(processId, 'Multiple Chapters');
      ssm.setJobsProgress(processId, 'URLs Analyzing...');
      const { title, urls } = await utils.scrapeTitlePage(urlString);
      const len = urls.length;
      for (let i = 0; i < len; i++) {
        ssm.setJobsTitle(processId, title);
        try {
          ssm.setJobsProgress(processId, `${utils.calcPer(i + 1, len)}%`);
          await dlHelperFromURL(urls[i], false, processId);
        } catch (e) {
          console.error(e);
          ssm.removeJob(processId);
          res.send('Error Occured');
          return;
        }
        ssm.setJobsProgress(processId, 'Standing by for 1 minute...');
        await utils.sleep(1000 * 60 * 1);
      }
    }
    ssm.removeJob(processId);
    res.send('Download Complete');
  } catch (e) {
    console.error(e);
    ssm.setMsg('Server Error');
  }
});

//チャンネル変更
app.post('/channel', async (req: Request, res: Response) => {
  console.log('req.body :', req.body);
  const { index } = req.body;
  utils.changeChannel(index);
  utils.fetchChannels().then((config) => {
    res.send(config.channelNames || { current: 'none' });
  });
  ssm.setMsg('Operation is completed without problems.(Channel Changed)');
});

//チャンネル追加
app.post('/channel/add', async (req: Request, res: Response) => {
  console.log('add channel');
  const { channelID } = req.body;
  const config = utils.loadConf<Config>();
  //check deplicate
  if (
    config.channel.alt.includes(channelID) ||
    config.channel.current === channelID
  ) {
    ssm.setMsg('Deplicate Channel ID Submitted. Ignore it.');
    utils.fetchChannels().then((config) => {
      res.send(config.channelNames || { current: 'none' });
    });
    return;
  }
  if (await utils.checkChannel(channelID)) {
    ssm.setMsg('Channel ID is valid. Added.');
  } else {
    ssm.setMsg('Channel ID is invalid. Ignore it.');
    utils.fetchChannels().then((config) => {
      res.send(config.channelNames || { current: 'none' });
    });
    return;
  }
  const newConfig = { ...config };
  newConfig.channel.alt.push(channelID);
  utils.writeConf(newConfig);
  utils.fetchChannels().then((config) => {
    res.send(config.channelNames || { current: 'none' });
  });
});
//チャンネル取得
app.get('/channel', (req: Request, res: Response) => {
  utils.fetchChannels().then((config) => {
    res.send(config.channelNames || { current: 'none' });
  });
});

// directory 構造
app.get('/directory', (req: Request, res: Response) => {
  const directory = outDir;
  let out: DirectoryOutbound = { titles: [], outbound: [] };
  const titles = fs.readdirSync(directory);
  titles.forEach((title) => {
    //if directory is empty, remove it
    if (fs.readdirSync(`${directory}/${title}`).length === 0) {
      fs.rmdirSync(`${directory}/${title}`);
      return;
    }
    out.titles.push(title);
    let episodes: string[] = [];
    const episodePaths = fs.readdirSync(`${directory}/${title}`);
    episodePaths.forEach((episode) => {
      const count = fs.readdirSync(`${directory}/${title}/${episode}`).length;
      episodes.push(`${episode}-${count}`);
    });
    out.outbound.push({
      title,
      episodes,
    });
  });
  res.send(out);
});

//複数push
app.post('/directory', async (req: Request, res: Response) => {
  const processId = ssm.createPushJob();
  const config = utils.loadConf<Config>();
  const checked: Checked[] = req.body;
  const discord = new Discord(config);
  await discord.login();
  await utils.sleep(3000);
  const len = checked.length;
  let count = 1;
  for (const check of checked) {
    const dir = outDir;
    const title = fs.readdirSync(dir)[check.index];
    const epDir = `${dir}/${title}`;
    ssm.setJobsTitle(processId, title);
    ssm.setJobsProgress(processId, `${utils.calcPer(count, len)}%`);
    const episodes = fs.readdirSync(epDir);
    const episodeIndex = check.checked;
    const threadName = `${title}第${utils.trimZero(
      episodes[episodeIndex[0]]
    )}-${utils.trimZero(episodes[episodeIndex[episodeIndex.length - 1]])}話`;
    await discord.sendText(threadName);
    await discord.sendMultipleEpisodes(epDir, check.checked, 500, threadName);
  }
  ssm.removeJob(processId);
  ssm.setMsg('Operation fullfilled (Push)');
  discord.killClient();
  res.send('ok');
});

//複数削除
/* app.delete('/directory', async (req: Request, res: Response) => {
  const checked: Checked[] = req.body;
  let rmHistory = '';
  let c = 1;
  const processId = ssm.createEtcJob();
  ssm.setJobsTitle(processId, 'Remove Directories');
  const len = checked.length;
  for (const check of checked) {
    ssm.setJobsProgress(processId, `${utils.calcPer(c, len)}%`);
    const dir = outDir;
    const title = fs.readdirSync(dir)[check.index];
    rmHistory += `${title}(`;
    const epDir = `${dir}/${title}`;
    const episodes = fs.readdirSync(epDir);
    const episodeIndex = check.checked;
    for (const index of episodeIndex) {
      rmHistory += ` ${episodes[index]},`;
      const episode = episodes[index];
      const episodeDir = `${epDir}/${episode}`;
      const files = fs.readdirSync(episodeDir);
      for (const file of files) {
        fs.unlinkSync(`${episodeDir}/${file}`);
      }
      fs.rmdirSync(episodeDir);
    }
    rmHistory += '), ';
    c++;
  }
  ssm.removeJob(processId);
  res.send('all done');
}); */

app.delete('/directory', async (req: Request, res: Response) => {
  const checked: Checked[] = req.body;
  const processId = ssm.createEtcJob();
  ssm.setJobsTitle(processId, 'Remove Directories');
  const dirs = utils.getDirList(checked, outDir);
  for (let c = 0; c < checked.length; c++) {
    ssm.setJobsProgress(processId, `${utils.calcPer(c + 1, checked.length)}%`);
    fs.rmSync(dirs[c], { recursive: true, force: true });
  }
  ssm.removeJob(processId);
  res.send('all done');
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'DELETE'],
  },
});

const ssm = new ServerStatusManager(io);

io.on('connection', (socket) => {
  console.log('A client has connected.');
  socket.on('disconnect', () => {
    console.log('A client has disconnected.');
  });
});

try {
  server.listen(PORT, () => {
    console.log(`Manga Eater Server Started in : http://localhost:${PORT}/`);
  });
} catch (e) {
  ssm.setMsg('Server Error');
  if (e instanceof Error) {
    console.error(e.message);
  }
}
