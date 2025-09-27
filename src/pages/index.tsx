import Head from 'next/head';
import { GetStaticProps } from 'next';
import { Container, Stack, Typography } from '@mui/material';
import { useTranslations } from 'next-intl';
import { DateTime } from 'luxon';
import NominationGrid from '@/components/NominationGrid/NominationGrid';

export default function HomePage() {
  const t = useTranslations('home');

  return (
    <>
      <Head>
        <meta name="description" content="AS4 Gas Nomination Grid demonstration" />
      </Head>
      <Container maxWidth="xl" sx={{ py: 6 }}>
        <Stack spacing={4}>
          <Stack spacing={1}>
            <Typography variant="h3" component="h1">
              {t('title')}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {t('intro')}
            </Typography>
          </Stack>
          <NominationGrid
            leadTimeHours={2}
            maxValue={100000}
            initialWeekStart={DateTime.now().setZone('Europe/Copenhagen').startOf('week')}
            initialDirection="entry"
            initialResolutionMinutes={60}
          />
        </Stack>
      </Container>
    </>
  );
}

export const getStaticProps: GetStaticProps = async () => {
  const messages = await import('@/messages/en.json').then((mod) => mod.default);
  return { props: { messages } };
};
