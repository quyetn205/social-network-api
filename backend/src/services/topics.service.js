import { err, getUserFromToken, ok } from '../controllers/shared.controller.js';
import {
    selectPreferenceTopicIds,
    selectTopics,
    selectTopicsByIds,
    upsertPreferences
} from '../repositories/topics.repository.js';

export async function GET_topics(req, res) {
    const rows = await selectTopics();
    return ok(res, rows);
}

export async function GET_preferences(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    const topicIds = await selectPreferenceTopicIds(user.id);
    const topics = await selectTopicsByIds(topicIds);
    return ok(res, { topics });
}

export async function PUT_update_preferences(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return err(res, 401, 'Could not validate credentials');

    const body = req.body;
    const { topic_ids } = body;
    if (!Array.isArray(topic_ids)) {
        return err(res, 400, 'topic_ids must be an array');
    }

    await upsertPreferences(user.id, topic_ids);
    const topics = await selectTopicsByIds(topic_ids);
    return ok(res, { topics });
}
