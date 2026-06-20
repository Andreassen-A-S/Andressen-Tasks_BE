-- Backfill replies created before reply_author_id was introduced.
UPDATE `task_comments` AS reply
INNER JOIN `task_comments` AS original
    ON original.`comment_id` = reply.`reply_to_comment_id`
SET reply.`reply_author_id` = original.`user_id`
WHERE reply.`reply_author_id` IS NULL;
