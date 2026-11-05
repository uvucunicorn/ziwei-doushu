# 命令行排盘（自用）

一个把 repo 里 `lib/ziwei/` 排盘引擎包成命令行的脚本，输出一张能直接看的十二宫盘 + 大限。

```bash
npx tsx scripts/calc/chart.ts \
  --date 1990-05-12 --time 14:30 --gender male \
  --lon 121.47 --city 上海 --province 上海 \
  --out chart.txt --json chart.json
```

| 参数 | 说明 |
| --- | --- |
| `--date` | 公历生日 `YYYY-MM-DD` |
| `--time` | 钟表时间 `HH:MM`（24 小时制） |
| `--gender` | `male` / `female` |
| `--lon` | 出生地经度，用于真太阳时校正；不传则不校正 |
| `--no-tst` | 强制不做真太阳时校正 |
| `--city` / `--province` | 仅作记录 |
| `--late-zishi` | 晚子时口径：`next-day`（默认）/ `current-day` / `all-current` |
| `--leap` | 闰月口径：`split`（默认）/ `next-month` / `prev-month` / `current-month` |
| `--out` | 把文字盘写到文件（UTF-8） |
| `--json` | 把完整 `ZiweiChart` JSON 写到文件 |

口径与线上一致：真太阳时 = 钟表时间 + 经度差 + 均时差；晚子时按真太阳时判断是否换日。
