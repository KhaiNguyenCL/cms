import winston from 'winston';
import config from '../../config';

const { combine, timestamp, errors, json, colorize, simple } = winston.format;

const logger = winston.createLogger({
    level: config.log.level,
    format: combine(
        timestamp(),
        errors({ stack: true }),
        json()
    ),
    defaultMeta: { service: 'signage-api' },
    transports: [
        new winston.transports.Console({
            format: config.env === 'development'
                ? combine(colorize(), simple())
                : combine(timestamp(), json()),
        }),
    ],
});

export default logger;
