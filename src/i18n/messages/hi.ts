import { core } from './hi/core';
import { enums } from './hi/enums';
import { app } from './hi/app';
import type { Messages } from '../index';

export const hi: Messages = { ...core, e: enums, ...app };
