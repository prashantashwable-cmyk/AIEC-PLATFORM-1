import { core } from './mr/core';
import { enums } from './mr/enums';
import { app } from './mr/app';
import type { Messages } from '../index';

export const mr: Messages = { ...core, e: enums, ...app };
