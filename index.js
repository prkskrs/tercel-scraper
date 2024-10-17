import puppeteer from 'puppeteer-core';
import express from 'express';
import cors from 'cors';
import chromium from '@sparticuz/chromium-min';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use(cors());

async function getBrowser() {
  return puppeteer.launch({
    args: [
      ...chromium.args,
      '--hide-scrollbars',
      '--disable-web-security',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(), // Vercel environment automatically resolves this
    headless: chromium.headless,
    ignoreHTTPSErrors: true,
  });
}

app.post('/scrape', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).send({ error: 'URL is required' });
  }

  try {
    const browser = await getBrowser();
    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    );

    console.log(`Navigating to URL: ${url}`);

    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 200000 });
    } catch (navError) {
      console.error(`Navigation error for ${url}:`, navError);
      await browser.close();
      return res.status(500).send({ error: 'Failed to navigate to the URL' });
    }

    const getBaseDomain = (url) => {
      try {
        const { hostname } = new URL(url);
        return hostname;
      } catch (error) {
        console.error(`Invalid URL: ${url}`, error);
        return '';
      }
    };

    const baseDomain = getBaseDomain(url);
    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a')).map((link) => link.href),
    );

    console.log(`Links from ${url}:`, links);

    const uniqueLinks = Array.from(new Set(links)).filter((link) => {
      const linkDomain = getBaseDomain(link);
      return linkDomain === baseDomain || linkDomain === 'github.com';
    });

    console.log(`Unique links from ${url}:`, uniqueLinks);

    let allContent = '';
    for (const link of uniqueLinks) {
      try {
        console.log(`Navigating to unique link: ${link}`);
        await page.goto(link, { waitUntil: 'networkidle2', timeout: 200000 });

        const content = await page.evaluate(() => document.body.innerText);
        console.log(`Content from ${link}:`, content);
        allContent += content + '\n';
      } catch (linkError) {
        console.error(`Error processing ${link}:`, linkError);
      }
    }

    await browser.close();

    return res.send({
      content: JSON.stringify(allContent),
      uniqueLinks,
      links,
    });
  } catch (error) {
    console.error('Internal Server Error:', error);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
