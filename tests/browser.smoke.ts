import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { chromium, type Page } from 'playwright-core';
import { createApp } from '../server/app';
import {
  makeShape,
  type BoardFile,
  type BoardShape,
} from '../src/shared/board';

const port = Number(process.env.BEEBO_TEST_PORT ?? 4173);
const origin = `http://127.0.0.1:${port}`;
const browserOptions = process.env.BROWSER_EXECUTABLE
  ? { executablePath: process.env.BROWSER_EXECUTABLE }
  : { channel: 'msedge' };
async function waitForTitle(page: Page, value: string) {
  await page.waitForFunction(
    (title) =>
      (
        document.querySelector(
          'input[aria-label="Board title"]',
        ) as HTMLInputElement
      )?.value === title,
    value,
  );
}
async function addNote(page: Page, text: string) {
  await page.getByRole('button', { name: 'Toggle Objects panel' }).click();
  await page.getByRole('button', { name: 'Add a note with keyboard' }).click();
  await page.getByLabel('Your text', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Add to board', exact: true }).click();
}

test(
  'header controls save/export, Share requires X, brush sizes persist, and strokes have generous zoom-safe hit areas',
  { timeout: 90_000 },
  async () => {
    const editorOrigin = `http://127.0.0.1:${port + 3}`;
    const app = createApp({ origins: [editorOrigin] });
    await app.listen({ port: port + 3, host: '127.0.0.1' });
    const browser = await chromium.launch({
      ...browserOptions,
      headless: true,
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 960 },
      });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(editorOrigin);
      await waitForTitle(page, 'Board 1');
      const header = page.locator('header');
      assert.equal(
        await header
          .getByRole('checkbox', { name: 'Save board locally' })
          .isChecked(),
        false,
      );
      await header
        .getByRole('button', { name: 'Share board', exact: true })
        .click();
      const share = page.getByRole('dialog', {
        name: 'Good ideas are better together',
      });
      assert.equal(
        await share.getByLabel('What should we call you?').inputValue(),
        'User',
      );
      await share.getByLabel('What should we call you?').fill('A learner');
      await page.mouse.click(3, 3);
      assert.equal(await share.isVisible(), true);
      await page.keyboard.press('Escape');
      assert.equal(await share.isVisible(), true);
      assert.equal(
        await share.getByLabel('What should we call you?').inputValue(),
        'A learner',
      );
      await share.getByRole('button', { name: 'Close dialog' }).click();
      await page
        .getByLabel('Board title', { exact: true })
        .fill('Manual snapshot');
      await header
        .getByRole('button', { name: 'Save board', exact: true })
        .click();
      await page
        .getByText(
          'Board saved on this device. Restore it from My workspace.',
          { exact: true },
        )
        .waitFor();
      await page.reload();
      await waitForTitle(page, 'Board 1');
      assert.equal(
        await header
          .getByRole('checkbox', { name: 'Save board locally' })
          .isChecked(),
        false,
      );
      await page
        .getByRole('button', { name: 'Board files', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Restore saved board', exact: true })
        .click();
      await waitForTitle(page, 'Manual snapshot');
      await page
        .getByRole('button', { name: 'Board files', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'New blank board', exact: false })
        .click();
      await waitForTitle(page, 'Board 1');
      const box = await page.locator('.canvas-host').boundingBox();
      assert.ok(box);
      async function draw(y: number) {
        await page.mouse.move(box!.x + 400, box!.y + y);
        await page.mouse.down();
        await page.mouse.move(box!.x + 650, box!.y + y, { steps: 8 });
        await page.mouse.up();
      }
      async function exported() {
        const downloaded = page.waitForEvent('download');
        await header
          .getByRole('button', { name: 'Export board', exact: true })
          .click();
        const file = await (await downloaded).path();
        assert.ok(file);
        return JSON.parse(await readFile(file, 'utf8')) as BoardFile;
      }
      await page.getByRole('button', { name: 'Pen (P)', exact: true }).click();
      const penSize = page.getByRole('slider', {
        name: 'Pen size',
        exact: true,
      });
      await penSize.focus();
      await penSize.press('Home');
      for (let i = 0; i < 7; i++) await penSize.press('ArrowRight');
      assert.equal(await penSize.inputValue(), '8');
      await draw(220);
      await page
        .getByRole('button', { name: 'Highlighter (L)', exact: true })
        .click();
      const highlightSize = page.getByRole('slider', {
        name: 'Highlighter size',
        exact: true,
      });
      await highlightSize.focus();
      await highlightSize.press('End');
      await draw(360);
      await page
        .getByRole('button', { name: 'Pen brush (P)', exact: true })
        .click();
      assert.equal(await penSize.inputValue(), '8');
      const before = await exported();
      assert.equal(
        before.shapes.find((shape) => shape.kind === 'stroke')?.strokeWidth,
        8,
      );
      assert.equal(
        before.shapes.find((shape) => shape.kind === 'highlight')?.strokeWidth,
        24,
      );
      await page
        .getByRole('button', { name: 'Cursor (V)', exact: true })
        .click();
      // Press 12px away from the visible line, outside the old 7px target radius.
      await page.mouse.move(box.x + 500, box.y + 232);
      await page.mouse.down();
      await page.mouse.move(box.x + 540, box.y + 257, { steps: 5 });
      await page.mouse.up();
      let stroke = (await exported()).shapes.find(
        (shape) => shape.kind === 'stroke',
      )!;
      assert.equal(stroke.x, 440);
      assert.equal(stroke.y, 245);
      for (let i = 0; i < 10; i++)
        await page
          .getByRole('button', { name: 'Zoom in', exact: true })
          .click();
      const atZoom = (x: number, y: number) => ({
        x: box.x - box.width / 2 + x * 2,
        y: box.y - box.height / 2 + y * 2,
      });
      const start = atZoom(550, 245);
      start.y += 12;
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + 40, start.y + 30, { steps: 5 });
      await page.mouse.up();
      stroke = (await exported()).shapes.find(
        (shape) => shape.kind === 'stroke',
      )!;
      assert.equal(stroke.x, 460);
      assert.equal(stroke.y, 260);
      await page.screenshot({
        path: 'test-results/editor-controls.png',
        fullPage: true,
      });
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await app.close();
    }
  },
);

test(
  'production client: editing, files, privacy defaults, two-browser sync, and mobile layout',
  { timeout: 120_000 },
  async () => {
    const app = createApp({ origins: [origin], directEnabled: true });
    await app.listen({ port, host: '127.0.0.1' });
    const browser = await chromium.launch({
      ...browserOptions,
      headless: true,
    });
    const errors: string[] = [];
    const external: string[] = [];
    try {
      const first = await browser.newContext({
        viewport: { width: 1440, height: 960 },
      });
      const second = await browser.newContext({
        viewport: { width: 1440, height: 960 },
      });
      const a = await first.newPage();
      const b = await second.newPage();
      for (const page of [a, b]) {
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('request', (request) => {
          if (
            !request.url().startsWith(origin) &&
            !request.url().startsWith('data:') &&
            !request.url().startsWith('blob:')
          )
            external.push(request.url());
        });
      }
      await a.goto(origin);
      await waitForTitle(a, 'Board 1');
      await mkdir('test-results', { recursive: true });
      await a.screenshot({ path: 'test-results/desktop.png', fullPage: true });
      await a.getByRole('button', { name: 'Share board', exact: true }).click();
      assert.equal(
        await a.getByRole('radio', { name: /Relay only/ }).isChecked(),
        true,
      );
      assert.equal(
        await a
          .getByRole('button', { name: 'Create private room' })
          .isDisabled(),
        true,
      );
      await a.getByRole('button', { name: 'Close dialog' }).click();
      // Saving is opt-in, explicit restore survives reload, and forgetting removes it.
      await a
        .getByLabel('Board title', { exact: true })
        .fill('My saved learning board');
      await a
        .getByRole('checkbox', { name: 'Save board locally', exact: true })
        .check();
      await a.getByText('Saved on this device', { exact: true }).waitFor();
      await a.reload();
      await waitForTitle(a, 'Board 1');
      await a.getByRole('button', { name: 'Board files', exact: true }).click();
      await a
        .getByRole('button', { name: 'Restore saved board', exact: true })
        .click();
      await waitForTitle(a, 'My saved learning board');
      await a.getByRole('button', { name: 'Board files', exact: true }).click();
      await a
        .getByRole('button', { name: 'Forget saved board', exact: true })
        .click();
      await a
        .getByRole('button', { name: 'Restore saved board', exact: true })
        .click();
      await a
        .getByText('No personal board is saved on this device.', {
          exact: true,
        })
        .waitFor();
      await a.getByRole('button', { name: 'Close dialog' }).click();
      await addNote(a, 'A keyboard-accessible idea');
      assert.ok(
        await a
          .getByRole('button', {
            name: 'A keyboard-accessible idea',
            exact: true,
          })
          .isVisible(),
      );
      await a.getByRole('button', { name: 'Close Objects panel' }).click();
      await a.getByRole('button', { name: 'Undo', exact: true }).click();
      await a.getByRole('button', { name: 'Redo', exact: true }).click();
      // Draw a rectangle through actual pointer events.
      await a
        .getByRole('button', { name: 'Rectangle (R)', exact: true })
        .click();
      await a.mouse.move(1080, 630);
      await a.mouse.down();
      await a.mouse.move(1240, 735, { steps: 8 });
      await a.mouse.up();
      await a.keyboard.press('p');
      assert.equal(
        await a
          .getByRole('button', { name: 'Pen (P)', exact: true })
          .getAttribute('aria-pressed'),
        'true',
      );
      await a.getByRole('button', { name: 'Cursor (V)', exact: true }).click();
      const downloadEvent = a.waitForEvent('download');
      await a
        .getByRole('button', { name: 'Export board', exact: true })
        .click();
      assert.ok(
        (await downloadEvent).suggestedFilename().endsWith('.beebo.json'),
      );
      await a.getByRole('button', { name: 'Share board', exact: true }).click();
      await a.getByRole('radio', { name: /Allow direct connections/ }).check();
      await a.getByRole('button', { name: 'Create private room' }).click();
      await a.getByLabel('Private invitation link').waitFor();
      const invite = await a.getByLabel('Private invitation link').inputValue();
      await a.getByRole('button', { name: 'Close dialog' }).click();
      await b.goto(invite);
      await b
        .getByRole('button', { name: 'Join shared board', exact: true })
        .click();
      await a
        .getByLabel('2 participants', { exact: true })
        .waitFor({ timeout: 20_000 });
      await b
        .getByLabel('2 participants', { exact: true })
        .waitFor({ timeout: 20_000 });
      await b.getByRole('button', { name: 'Close dialog' }).click();
      await a
        .getByLabel('Board title', { exact: true })
        .fill('Learning together');
      await waitForTitle(b, 'Learning together');
      await addNote(b, 'An encrypted shared idea');
      await a.getByRole('button', { name: 'Toggle Objects panel' }).click();
      await a
        .getByRole('button', { name: 'An encrypted shared idea', exact: true })
        .waitFor();
      await a.screenshot({
        path: 'test-results/collaboration.png',
        fullPage: true,
      });
      // A fresh browser context rejoins and receives the existing document.
      await b.reload();
      await b.getByRole('button', { name: 'Join shared board' }).click();
      await waitForTitle(b, 'Learning together');
      await b.getByRole('button', { name: 'Close dialog' }).click();
      await b.getByRole('button', { name: 'Toggle Objects panel' }).click();
      await b
        .getByRole('button', { name: 'An encrypted shared idea', exact: true })
        .waitFor();
      const mobile = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      const phone = await mobile.newPage();
      phone.on('pageerror', (error) => errors.push(error.message));
      await phone.goto(origin);
      await phone.getByRole('button', { name: 'Fit board to screen' }).click();
      assert.equal(
        await phone.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await phone.screenshot({
        path: 'test-results/mobile.png',
        fullPage: true,
      });
      assert.deepEqual(errors, []);
      assert.deepEqual(external, []);
    } finally {
      await browser.close();
      await app.close();
    }
  },
);

test(
  'eight isolated browser peers converge on the same board',
  { timeout: 120_000 },
  async () => {
    const meshOrigin = `http://127.0.0.1:${port + 1}`;
    const app = createApp({ origins: [meshOrigin], directEnabled: true });
    await app.listen({ port: port + 1, host: '127.0.0.1' });
    const browser = await chromium.launch({
      ...browserOptions,
      headless: true,
    });
    const errors: string[] = [];
    try {
      const pages: Page[] = [];
      const hostContext = await browser.newContext();
      const host = await hostContext.newPage();
      pages.push(host);
      host.on('pageerror', (error) => errors.push(error.message));
      await host.goto(meshOrigin);
      await host
        .getByRole('button', { name: 'Share board', exact: true })
        .click();
      await host
        .getByRole('radio', { name: /Allow direct connections/ })
        .check();
      await host.getByRole('button', { name: 'Create private room' }).click();
      await host.getByLabel('Private invitation link').waitFor();
      const invite = await host
        .getByLabel('Private invitation link')
        .inputValue();
      await host.getByRole('button', { name: 'Close dialog' }).click();
      for (let i = 1; i < 8; i++) {
        const context = await browser.newContext();
        const page = await context.newPage();
        pages.push(page);
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(invite);
        await page.getByRole('button', { name: 'Join shared board' }).click();
        await page.getByRole('button', { name: 'Close dialog' }).click();
      }
      await Promise.all(
        pages.map((page) =>
          page
            .getByLabel('8 participants', { exact: true })
            .waitFor({ timeout: 30_000 }),
        ),
      );
      await host
        .getByLabel('Board title', { exact: true })
        .fill('Eight minds, one board');
      await Promise.all(
        pages.map((page) => waitForTitle(page, 'Eight minds, one board')),
      );
      await addNote(pages[5], 'A discovery from learner six');
      await Promise.all(
        pages.map(async (page) => {
          const panel = page.getByRole('button', {
            name: 'Toggle Objects panel',
          });
          if ((await panel.getAttribute('aria-pressed')) !== 'true')
            await panel.click();
          await page
            .getByRole('button', {
              name: 'A discovery from learner six',
              exact: true,
            })
            .waitFor();
          await page
            .getByRole('button', { name: 'Close Objects panel' })
            .click();
        }),
      );
      const boards = [];
      for (const page of pages) {
        const downloaded = page.waitForEvent('download');
        await page
          .getByRole('button', { name: 'Export board', exact: true })
          .click();
        const file = await (await downloaded).path();
        assert.ok(file);
        boards.push(JSON.parse(await readFile(file, 'utf8')));
      }
      for (const board of boards) assert.deepEqual(board, boards[0]);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await app.close();
    }
  },
);

test(
  'canvas gestures: cursor moves every element, held eraser sweeps, and middle mouse pans',
  { timeout: 60_000 },
  async () => {
    const canvasOrigin = `http://127.0.0.1:${port + 2}`;
    const app = createApp({ origins: [canvasOrigin] });
    await app.listen({ port: port + 2, host: '127.0.0.1' });
    const browser = await chromium.launch({
      ...browserOptions,
      headless: true,
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 960 },
      });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(canvasOrigin);
      const shapes: BoardShape[] = [
        { ...makeShape('rect', 250, 180), width: 120, height: 90 },
        { ...makeShape('ellipse', 500, 180), width: 120, height: 90 },
        {
          ...makeShape('text', 760, 180),
          width: 200,
          height: 60,
          text: 'Move this text',
        },
        {
          ...makeShape('sticky', 250, 400),
          width: 180,
          height: 100,
          fill: '#f5e7a1',
          text: 'Move this note',
        },
        {
          ...makeShape('stroke', 500, 400),
          width: 120,
          height: 80,
          points: [0, 0, 120, 80],
        },
        { ...makeShape('arrow', 760, 400), width: 120, height: 80 },
      ];
      let imported = 0;
      async function load(shapes: BoardShape[]) {
        const title = `Canvas interactions ${++imported}`;
        await page.locator('input[type="file"]').setInputFiles({
          name: 'canvas.beebo.json',
          mimeType: 'application/json',
          buffer: Buffer.from(
            JSON.stringify({
              format: 'beebo-board',
              version: 1,
              title,
              shapes,
            }),
          ),
        });
        await waitForTitle(page, title);
      }
      async function exported() {
        const downloaded = page.waitForEvent('download');
        await page
          .getByRole('button', { name: 'Export board', exact: true })
          .click();
        const path = await (await downloaded).path();
        assert.ok(path);
        const board = JSON.parse(await readFile(path, 'utf8')) as BoardFile;
        return board;
      }
      await load(shapes);
      const box = await page.locator('.canvas-host').boundingBox();
      assert.ok(box);
      const starts = [
        { x: 310, y: 225 },
        { x: 560, y: 225 },
        { x: 785, y: 195 },
        { x: 320, y: 450 },
        { x: 560, y: 440 },
        { x: 820, y: 440 },
      ];
      await page
        .getByRole('button', { name: 'Cursor (V)', exact: true })
        .click();
      for (const start of starts) {
        await page.mouse.move(box.x + start.x, box.y + start.y);
        await page.mouse.down();
        await page.mouse.move(box.x + start.x + 40, box.y + start.y + 30, {
          steps: 6,
        });
        await page.mouse.up();
      }
      const moved = await exported();
      for (const shape of shapes) {
        const result = moved.shapes.find((value) => value.id === shape.id);
        assert.ok(result, shape.kind);
        assert.equal(
          result.x,
          shape.x + 40,
          `${shape.kind} moved horizontally`,
        );
        assert.equal(result.y, shape.y + 30, `${shape.kind} moved vertically`);
      }
      const overlap = { ...shapes[0], id: 'under-the-rectangle' };
      await load([...shapes, overlap]);
      await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
      const scale = 1.1;
      const screen = (x: number, y: number) => ({
        x: box.x + (box.width / 2) * (1 - scale) + x * scale,
        y: box.y + (box.height / 2) * (1 - scale) + y * scale,
      });
      await page.getByRole('button', { name: 'Pen (P)', exact: true }).click();
      await page
        .getByRole('button', { name: 'Object eraser (E)', exact: true })
        .click();
      let p = screen(200, 200);
      await page.mouse.move(p.x, p.y);
      // Hover must not erase. A single large move while held must not skip crossed objects.
      p = screen(1000, 200);
      await page.mouse.move(p.x, p.y);
      assert.equal((await exported()).shapes.length, 7);
      p = screen(200, 200);
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      p = screen(1000, 200);
      await page.mouse.move(p.x, p.y);
      await page.mouse.up();
      p = screen(200, 440);
      await page.mouse.move(p.x, p.y);
      p = screen(1000, 440);
      await page.mouse.move(p.x, p.y);
      const erased = await exported();
      assert.deepEqual(
        erased.shapes.map((shape) => shape.id).sort(),
        shapes
          .slice(3)
          .map((shape) => shape.id)
          .sort(),
      );
      // Starting directly on a note must continue the same gesture onto a stroke and arrow.
      p = screen(300, 440);
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      p = screen(1000, 440);
      await page.mouse.move(p.x, p.y);
      await page.mouse.up();
      assert.equal((await exported()).shapes.length, 0);
      await load(shapes);
      await page
        .getByRole('button', { name: 'Reset zoom to 100 percent' })
        .click();
      for (const tool of ['Cursor (V)', 'Pen (P)', 'Object eraser (E)']) {
        if (tool === 'Object eraser (E)')
          await page
            .getByRole('button', { name: 'Pen (P)', exact: true })
            .click();
        await page.getByRole('button', { name: tool, exact: true }).click();
        // Start on an existing object: middle dragging must never move, draw, or erase content.
        await page.mouse.move(box.x + 310, box.y + 225);
        await page.mouse.down({ button: 'middle' });
        await page.mouse.move(box.x + 410, box.y + 285, { steps: 5 });
        assert.equal(
          await page
            .locator('.canvas-host')
            .evaluate((node) => node.classList.contains('is-panning')),
          true,
        );
        await page.mouse.up({ button: 'middle' });
        await page.waitForFunction(
          () =>
            !document
              .querySelector('.canvas-host')
              ?.classList.contains('is-panning'),
        );
        const position = await page
          .locator('.canvas-host')
          .evaluate((node) => (node as HTMLElement).style.backgroundPosition);
        assert.equal(position, '100px 60px');
        assert.deepEqual((await exported()).shapes, shapes);
        await page
          .getByRole('button', { name: 'Reset zoom to 100 percent' })
          .click();
      }
      // Release outside the canvas must end panning instead of leaving the pointer stuck.
      await page.mouse.move(box.x + 1000, box.y + 500);
      await page.mouse.down({ button: 'middle' });
      await page.mouse.move(box.x + 1100, 20);
      await page.mouse.up({ button: 'middle' });
      const endedPosition = await page
        .locator('.canvas-host')
        .evaluate((node) => (node as HTMLElement).style.backgroundPosition);
      await page.mouse.move(box.x + 900, box.y + 500);
      assert.equal(
        await page
          .locator('.canvas-host')
          .evaluate((node) => (node as HTMLElement).style.backgroundPosition),
        endedPosition,
      );
      await page
        .getByRole('button', { name: 'Reset zoom to 100 percent' })
        .click();
      await page.getByRole('button', { name: 'Hand (H)', exact: true }).click();
      await page.mouse.move(box.x + 1000, box.y + 500);
      await page.mouse.down();
      await page.mouse.move(box.x + 1040, box.y + 530, { steps: 4 });
      await page.mouse.up();
      assert.equal(
        await page
          .locator('.canvas-host')
          .evaluate((node) => (node as HTMLElement).style.backgroundPosition),
        '40px 30px',
      );
      await page
        .getByRole('button', { name: 'Reset zoom to 100 percent' })
        .click();
      await page
        .getByRole('button', { name: 'Cursor (V)', exact: true })
        .click();
      await page.mouse.move(box.x + 310, box.y + 225);
      await page.keyboard.down('Space');
      await page.mouse.down();
      await page.mouse.move(box.x + 350, box.y + 255, { steps: 6 });
      await page.mouse.up();
      await page.keyboard.up('Space');
      assert.equal(
        await page
          .locator('.canvas-host')
          .evaluate((node) => (node as HTMLElement).style.backgroundPosition),
        '0px 0px',
      );
      const afterSpace = await exported();
      assert.equal(afterSpace.shapes[0].x, shapes[0].x + 40);
      assert.equal(afterSpace.shapes[0].y, shapes[0].y + 30);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await app.close();
    }
  },
);
