import { ok } from './shared.controller.js';

export async function GET_health(req, res) {
    return ok(res, { status: 'ok' });
}
