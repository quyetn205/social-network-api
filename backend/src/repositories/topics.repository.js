import { sql } from '../../db.js';

export async function selectTopics() {
    const { rows } = await sql`SELECT * FROM topics ORDER BY id`;
    return rows;
}

export async function selectPreferenceTopicIds(userId) {
    const { rows } =
        await sql`SELECT topic_ids FROM user_preferences WHERE user_id = ${userId}`;
    return rows[0]?.topic_ids || [];
}

export async function selectTopicsByIds(topicIds) {
    const { rows } =
        await sql`SELECT * FROM topics WHERE id = ANY(${topicIds})`;
    return rows;
}

export async function upsertPreferences(userId, topicIds) {
    const { rowCount } =
        await sql`UPDATE user_preferences SET topic_ids = ${topicIds}, updated_at = NOW() WHERE user_id = ${userId}`;
    if (!rowCount) {
        await sql`INSERT INTO user_preferences (user_id, topic_ids, updated_at) VALUES (${userId}, ${topicIds}, NOW())`;
    }
}
