import type { AppProps } from 'next/app';
import Head from 'next/head';
import { NextIntlClientProvider } from 'next-intl';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { Toaster } from 'sonner';

const theme = createTheme();

export default function App({ Component, pageProps }: AppProps<{ messages: Record<string, string> }>) {
  const { messages = {} } = pageProps;

  return (
    <NextIntlClientProvider messages={messages} locale="en" timeZone="Europe/Copenhagen">
      <Head>
        <title>AS4 Gas Nomination Grid Demo</title>
      </Head>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Component {...pageProps} />
        <Toaster position="top-right" richColors closeButton />
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
