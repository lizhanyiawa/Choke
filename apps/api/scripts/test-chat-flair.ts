/**
 * 聊天彩蛋的规则测试：只有指定 osu! 用户发言才补 😞😞😞，已以 😞 结尾不补。
 *
 *   pnpm --filter @choke/api exec tsx scripts/test-chat-flair.ts
 */
import assert from "node:assert/strict"

import { applyChatFlair } from "@choke/shared/chat-flair"

const TARGET = 35440492

assert.equal(applyChatFlair(TARGET, "你好"), "你好😞😞😞", "名单里的用户补三个")
assert.equal(applyChatFlair(String(TARGET), "你好"), "你好😞😞😞", "id 是字符串也认")
assert.equal(applyChatFlair(TARGET, "你好  "), "你好😞😞😞", "末尾空白先去掉再补")
assert.equal(applyChatFlair(TARGET, "好难过😞"), "好难过😞", "已以 😞 结尾不补")
assert.equal(applyChatFlair(TARGET, "好难过😞😞😞 "), "好难过😞😞😞 ", "已以 😞 结尾（后面有空白）不补，原样返回")
assert.equal(applyChatFlair(TARGET, "😞 不是结尾"), "😞 不是结尾😞😞😞", "😞 在中间不算")
assert.equal(applyChatFlair(TARGET, ""), "", "空消息不补")
assert.equal(applyChatFlair(TARGET, "   "), "   ", "全空白不补")
assert.equal(applyChatFlair(123, "你好"), "你好", "别人不补")
assert.equal(applyChatFlair(null, "你好"), "你好", "没有 osu! 绑定不补")
assert.equal(applyChatFlair(undefined, "你好"), "你好", "没有 osu! 绑定不补")

console.log("chat-flair 全部通过")
