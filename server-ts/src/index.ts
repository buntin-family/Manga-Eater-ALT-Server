import express, { Application, Request, Response } from 'express';
import fs from 'fs';
import * as utils from './scrapeUtils';
import type { Config } from './scrapeUtils';
import Discord from './Discord';

console.log('Manga Eater Server is Starting...\nThis is a index.ts');

const app: Application = express();
const PORT = 3000;

interface CorsFunc {
  (req: Request, res: Response, next: Function): void;
}

const allowCrossDomain: CorsFunc = (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
  res.header(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, access_token'
  );
  if ('OPTIONS' === req.method) {
    res.send(200);
  } else {
    next();
  }
};

app.use(allowCrossDomain);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', async (_req: Request, res: Response) => {
  res.send('Manga Eater Server is Ready.');
});

/* Main Process */
app.post('/', async (req: Request, res: Response) => {
  const config = utils.loadConf<Config>();
  const { urls, title, ifPush } = req.body;
  const directory = `./out/${title}`;
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory);
  }
  const timebound = 100;
  const filenames = utils.generateOrderFilenames(urls);
  await utils.downloadImages(urls, filenames, timebound, directory);
  console.log(ifPush);
  if (ifPush) {
    const discord = new Discord(config);
    await discord.login();
    await discord.sendFiles(directory, title, 500);
    discord.killClient();
  } else {
    console.log('No Push');
  }
  res.send('Download Complete');
});

app.post('/channel', async (req: Request, res: Response) => {
  console.log('req.body :', req.body);
  const { index } = req.body;
  utils.changeChannel(index);
  utils.fetchChannels().then((config) => {
    res.send(config.channelNames || { current: 'none' });
  });
});
app.get('/channel', (req: Request, res: Response) => {
  utils.fetchChannels().then((config) => {
    res.send(config.channelNames || { current: 'none' });
  });
});

try {
  app.listen(PORT, () => {
    console.log(`Manga Eater Server Started in : http://localhost:${PORT}/`);
  });
} catch (e) {
  if (e instanceof Error) {
    console.error(e.message);
  }
}
