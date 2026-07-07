import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const toneWavPath = fileURLToPath(new URL('./e2e/fixtures/tone-440hz.wav', import.meta.url));
const silenceWavPath = fileURLToPath(new URL('./e2e/fixtures/silence.wav', import.meta.url));

function fakeAudioArgs(wavPath: string) {
  return [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    `--use-file-for-fake-audio-capture=${wavPath}`,
    '--autoplay-policy=no-user-gesture-required',
  ];
}

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:8000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8000',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'tone',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: fakeAudioArgs(toneWavPath) },
        permissions: ['microphone'],
      },
    },
    {
      name: 'silence',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: fakeAudioArgs(silenceWavPath) },
        permissions: ['microphone'],
      },
    },
  ],
});
