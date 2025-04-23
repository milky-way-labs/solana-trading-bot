process.env.TZ = 'Europe/Rome';

import pino from 'pino';

const prettyTime = 'SYS:dd/mm/yyyy HH:MM:ss.l "EU/Rome"'; 

const transport = pino.transport({
  targets: [

    {
      level: 'trace',
      target: 'pino-pretty',
      options: {
        destination: './logs/activity.log',
        colorize: false,
        translateTime: prettyTime,
      },
    },

    
    {
      level: 'trace',
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: prettyTime,
      },
    },
  ],
});

export const logger = pino(
  {
    level: 'info',
    redact: ['poolKeys'],
    serializers: { error: pino.stdSerializers.err },
    base: undefined,
  },
  transport,
);
