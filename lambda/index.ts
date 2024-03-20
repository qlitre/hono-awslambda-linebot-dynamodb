import { Hono } from 'hono'
import { handle } from 'hono/aws-lambda'
import { DynamoDB } from 'aws-sdk';

import {
    MessageAPIResponseBase,
    TextMessage,
    WebhookEvent,
} from "@line/bot-sdk";

const app = new Hono()
const dynamoDb = new DynamoDB.DocumentClient();

app.get('/', (c) => c.text('Hello Hono!'))

app.post("/api/webhook", async (c) => {
    const data = await c.req.json();
    const events: WebhookEvent[] = (data as any).events;
    const accessToken: string = process.env.CHANNEL_ACCESS_TOKEN || '';

    await Promise.all(
        events.map(async (event: WebhookEvent) => {
            try {
                await textEventHandler(event, accessToken);
                return
            } catch (err: unknown) {
                if (err instanceof Error) {
                    console.error(err);
                }
                return c.json({
                    status: "error",
                });
            }
        })
    );
    return c.json({ message: "ok" });
});

// 最新の体重を取得
const getLatestWeightFromDynamoDB = async (userId: string) => {
    const params = {
        TableName: 'MyWeight',
        KeyConditionExpression: 'UserId = :userId',
        ExpressionAttributeValues: {
            ':userId': userId
        },
        ScanIndexForward: false,
        Limit: 1
    }
    const data = await dynamoDb.query(params).promise();
    return data.Items?.[0]?.Weight;
}

// 体重を登録
const saveWeightToDynamoDB = async (userId: string, weight: number) => {
    const params = {
        TableName: 'MyWeight',
        Item: {
            UserId: userId,
            Weight: weight,
            CreatedAt: new Date().toISOString()
        }
    }
    await dynamoDb.put(params).promise();
}

// 体重を比較して文字列を返す
const buildLineMessage = (latestWeight: number | undefined, curWeight: number) => {
    // 初回は比較できないので±0で返す
    if (!latestWeight) return `${curWeight}kg(±0)`;
    const diff = curWeight - latestWeight;
    const diffStr = diff.toFixed(1);
    let msg = `${curWeight}kg`
    if (diff > 0) {
        msg += `(+${diffStr})`
    } else if (diff < 0) {
        msg += `(${diffStr})`
    } else {
        msg += `(±0)`
    }
    return msg
}

const textEventHandler = async (
    event: WebhookEvent,
    accessToken: string
): Promise<MessageAPIResponseBase | undefined> => {
    if (event.type !== "message" || event.message.type !== "text") {
        return;
    }
    const userId = event.source.userId;
    const curWeight = parseFloat(event.message.text); // 体重データのパース
    let lineMessage = '';
    if (!isNaN(curWeight) && userId) {
        // 最後の値を取得
        const latestWeight = await getLatestWeightFromDynamoDB(userId);
        // メッセージを作成
        lineMessage = buildLineMessage(latestWeight, curWeight);
        // 現在の値を保存
        await saveWeightToDynamoDB(userId, curWeight);
    } else {
        // 数値にできなかったケース
        lineMessage = '不正な値が入力されました。数値を入力してください。'
    }

    const { replyToken } = event;
    const response: TextMessage = {
        type: "text",
        text: lineMessage,
    };
    await fetch("https://api.line.me/v2/bot/message/reply", {
        body: JSON.stringify({
            replyToken: replyToken,
            messages: [response],
        }),
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
    });
    return
};

export const handler = handle(app)