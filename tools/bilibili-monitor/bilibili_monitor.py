"""
B站 UP主 新视频监控 + 字幕提取
供 n8n Execute Command 节点调用，输出 JSON 给下游 LLM 和飞书写入

用法:
  python bilibili_monitor.py [uid1] [uid2] ...
  python bilibili_monitor.py 123456 789012

未传参时使用脚本内置的 UP_LIST
"""

import asyncio
import json
import sys
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests
from bilibili_api import user, video

# ============================================================
# 配置区 —— 按需修改
# ============================================================

# 默认 UP 主 UID 列表（替换为你实际关注的UP主）
UP_LIST = [
    # TODO: 替换为实际的 UP主 UID
    # 示例格式参考：{ "uid": 123456, "label": "UP主名称" }
]

# 只看最近多少小时内的视频
HOURS_LOOKBACK = 24

# 字幕文本最大长度（避免超长字幕塞爆 LLM 上下文）
MAX_SUBTITLE_LENGTH = 8000


# ============================================================
# 核心逻辑
# ============================================================

async def fetch_recent_videos(uid: int, hours: int = HOURS_LOOKBACK):
    """获取 UP主 最近发布的视频"""
    u = user.User(uid)
    videos_data = await u.get_videos(ps=10, pn=1, order="pubdate")

    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    recent = []

    for v in videos_data.get("list", {}).get("vlist", []):
        created = datetime.fromtimestamp(v["created"], tz=timezone.utc)
        if created < cutoff:
            continue
        recent.append({
            "bvid": v["bvid"],
            "title": v["title"],
            "description": v.get("description", ""),
            "created": created.isoformat(),
            "url": f"https://www.bilibili.com/video/{v['bvid']}",
            "author": v.get("author", ""),
            "length": v.get("length", ""),
        })

    return recent


async def get_subtitle_text(bvid: str) -> Optional[str]:
    """下载视频 AI 字幕并拼接为纯文本"""
    try:
        v = video.Video(bvid=bvid)
        info = await v.get_subtitle()

        subtitles = info.get("subtitles") or info.get("subtitle", {}).get("subtitles", [])
        if not subtitles:
            return None

        # 优先选中文 AI 字幕
        sub = subtitles[0]
        for s in subtitles:
            if "zh" in s.get("lan_doc", "").lower() or "ai" in s.get("lan_doc", "").lower():
                sub = s
                break

        url = sub["subtitle_url"]
        if url.startswith("//"):
            url = "https:" + url

        resp = requests.get(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Referer": "https://www.bilibili.com/",
        }, timeout=15)
        resp.raise_for_status()

        subs = resp.json()
        texts = [item["content"] for item in subs.get("body", [])]
        full_text = "\n".join(texts)

        # 截断过长的字幕
        if len(full_text) > MAX_SUBTITLE_LENGTH:
            full_text = full_text[:MAX_SUBTITLE_LENGTH] + "\n...(字幕已截断)"

        return full_text

    except Exception as e:
        return f"[字幕获取失败: {e}]"


async def main(uids: list[int]):
    """主逻辑：遍历 UP 主，拉视频 + 字幕，输出 JSON"""
    all_results = []

    for uid in uids:
        try:
            videos = await fetch_recent_videos(uid)
        except Exception as e:
            print(f"[WARN] 获取 UID={uid} 视频失败: {e}", file=sys.stderr)
            continue

        for v in videos:
            subtitle_text = await get_subtitle_text(v["bvid"])
            all_results.append({
                "标题": v["title"],
                "内容": subtitle_text or v["description"],
                "日期": v["created"],
                "链接": v["url"],
                "来源": f"B站 - {v['author']}",
                "板块": "B站更新",
                "bvid": v["bvid"],
                "视频时长": v["length"],
                "有字幕": subtitle_text is not None and not subtitle_text.startswith("[字幕"),
            })

    # 按发布时间倒序
    all_results.sort(key=lambda x: x["日期"], reverse=True)

    print(json.dumps(all_results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    # 优先用命令行传入的 UID
    if len(sys.argv) > 1:
        uids = [int(uid) for uid in sys.argv[1:]]
    else:
        uids = [item["uid"] for item in UP_LIST]

    if not uids:
        print("[]")
        sys.exit(0)

    asyncio.run(main(uids))
