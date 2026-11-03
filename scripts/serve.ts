import { startServer } from './https-serve.ts';

const httpOnly = process.argv.includes('--http');
startServer(httpOnly);
