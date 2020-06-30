import dotenv from 'dotenv';
import RobinsHealthBot from '.';

dotenv.config();
const token = process.env.DISCORD_BOT_TOKEN;
if (token === undefined) throw Error('DISCORD_BOT_TOKEN not set!');

new RobinsHealthBot(token);