import { strictEqual } from 'assert';
import * as z from './interop.cjs';

strictEqual(z.s, 's');
strictEqual(z.__esModule, true);
strictEqual(z.default.default, 'z');
strictEqual(z.default.s, 's');
