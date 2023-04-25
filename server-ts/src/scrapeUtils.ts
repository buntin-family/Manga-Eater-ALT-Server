import request from 'request';
import path from 'path';
import fs from 'fs';
import loading from 'loading-cli';
import { Builder, By, Capabilities } from 'selenium-webdriver';
import prettier from 'prettier/standalone';
import parserHtml from 'prettier/parser-html';
const capabilities: Capabilities = Capabilities.chrome();
capabilities.set('chromeOptions', {
    args: ['--headless', '--disable-gpu', '--window-size=1024,768'],
    w3c: false,
});

const sleep = async (ms: number) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return;
};

const fetchWithTimebound = async (
    urls: string[],
    filenames: string[],
    timebound: number,
    directory: string
) => {
    const loadingBar = loading('Downloading...').start();
    for (let i = 0; i < urls.length; i++) {
        loadingBar.text = `Downloading ${i + 1}/${urls.length}`;
        const url = urls[i];
        const filename = filenames[i];
        // ESOCKETTIMEDOUTが出るのであえてworkerを増やさず同期処理する。
        request({ method: 'GET', url, encoding: null }, (err, res, body) => {
            if (!err && res.statusCode === 200) {
                fs.writeFileSync(
                    path.join(directory, filename),
                    body,
                    'binary'
                );
            }
        });
        await sleep(timebound);
    }
    loadingBar.stop();
};

const downloadImages = async (
    urls: string[],
    filenames: string[],
    timebound: number,
    directory: string
) => {
    let load = loading('in Image scrape sequence : started').start();
    if (urls.length !== filenames.length) {
        load.fail(
            'in Image scrape sequence : urls.length !== filenames.length'
        );
        throw new Error('urls.length !== filenames.length');
    }
    //if directory does not exist, create it.
    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory);
    }
    const requestOps: RequestInit = {
        method: 'GET',
        headers: {
            accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'accept-encoding': 'gzip, deflate, br',
            'accept-language':
                'ja-JP,ja;q=0.9,en-US;q=0.8,en-GB;q=0.7,en-IN;q=0.6,en-AU;q=0.5,en-CA;q=0.4,en-NZ;q=0.3,en-ZA;q=0.2,en;q=0.1',
            referer: 'https://mangarawjp.io/',
            'sec-ch-ua':
                '"Chromium";v="112", "Google Chrome";v="112", "Not:A-Brand";v="99"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': 'Windows',
            'sec-fetch-dest': 'image',
            'sec-fetch-mode': 'no-cors',
            'sec-fetch-site': 'cross-site',
            'user-agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36',
        },
    };
    for (let i = 0; i < urls.length; i++) {
        load.text = `in Image scrape sequence : ${i + 1}/${urls.length}`;
        const url = urls[i];
        const filename = filenames[i];
        const img = fetch(url, requestOps);
        const buffer = Buffer.from(await (await img).arrayBuffer());
        fs.writeFileSync(path.join(directory, filename), buffer);
        await sleep(timebound);
    }
    load.succeed('in Image scrape sequence : finished');
};

const generateFilenames = (urls: string[]) => {
    const filenames: string[] = [];
    let i = 0;
    urls.forEach((url) => {
        i++;
        filenames.push(url.split('/').pop() || `image${i}.file`);
    });
    return filenames;
};

const generateOrderFilenames = (urls: string[]) => {
    const filenames: string[] = [];
    for (let i = 0; i < urls.length; i++) {
        const imageFormat = urls[i].split('.').pop();
        // 001 002, 003, ...
        filenames.push(`${(i + 1).toString().padStart(3, '0')}.${imageFormat}`);
    }
    return filenames;
};

const generateUrls = async (baseUrl: string) => {
    const load = loading('in Image scrape sequence : started').start();
    let driver = await new Builder().forBrowser('chrome').build();
    await driver.get(baseUrl);
    await sleep(1000);
    const title = await driver.getTitle();
    load.text = `in Image scrape sequence : title scraped : ${title}`;
    /* const els = await driver.findElements(By.className('card-wrap'));
    const url = els.map(async (el) => {
        //scroll to the element
        await driver.executeScript(
            'arguments[0].scrollIntoView({behavior: "smooth", block: "center", inline: "center"});',
            el
        );
        await sleep(1000);
        const img = await el.findElement(By.tagName('img'));
        const src = await img.getAttribute('src');
        return src;
    }); */
    const topDiv = await driver.findElement(By.id('top'));
    await sleep(1000);
    /* load.text = `in Image scrape sequence : scraped ${urls.length} images`;
    load.succeed('in Image scrape sequence : finished');
    return urls; */
    const urls: string[] = [];
    return urls;
};

const saveAsJson = (data: any, filename: string) => {
    //if the file is exist, overwrite it.
    fs.writeFileSync(filename, JSON.stringify(data, null, 4));
};

export {
    fetchWithTimebound,
    generateFilenames,
    sleep,
    generateUrls,
    downloadImages,
    generateOrderFilenames,
    saveAsJson,
};
