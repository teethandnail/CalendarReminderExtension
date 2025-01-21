# Calendar Reminder VSCode 插件

在 Markdown 文件中快速创建 macOS 日历提醒事项的 VSCode 插件。

## 功能特点

- 在 Markdown 文件中使用简单的语法创建日历提醒
- 支持设置提醒时间（默认提前 30 分钟）
- 支持删除已创建的提醒
- 自动跳过已过期的提醒创建
- 支持工作区配置，每个项目可以有独立的提醒文件

 ## 演示视频
https://github.com/user-attachments/assets/ab9d0ae9-4fa0-4e2b-9d65-7c975ac890cb

## 使用前提

- macOS 操作系统
- 已安装日历应用
- VSCode 1.65.0 或更高版本

## 配置说明

1. 在项目根目录创建 `.vscode` 文件夹（如果不存在）
2. 在 `.vscode` 文件夹中创建 `settings.json` 文件
3. 在 `settings.json` 中添加以下配置：
```json
{
    "calendarReminder.targetFile": "reminders.md",
    "calendarReminder.calendarName": "Home"
}
```
注意：
- `targetFile` 是相对于项目根目录的路径
- 确保指定的文件夹（如 `docs`）已存在
- 文件必须是 `.md` 格式

## 使用方法

在指定的 Markdown 文件中使用以下格式创建提醒：

### 基本格式
```markdown
@reminder: [日期] [时间] [标题]
```

### 带时间范围的格式
```markdown
@reminder: [日期] [开始时间]-[结束时间] [标题]
```

### 自定义提醒时间
```markdown
@reminder: [日期] [时间] [标题] ![分钟数]
```

### 删除提醒
```markdown
@reminder: [日期] [时间] [标题] !delete
```

## 示例

```markdown
# 我的提醒

@reminder: 2025-01-15 15:00 开会
@reminder: 2025-01-16 09:30-10:30 项目评审 !15
@reminder: 2025-01-17 14:00 下午茶 !delete
```

## 工作原理

1. 插件会监听你在 `settings.json` 中指定的 Markdown 文件
2. 当文件保存时，自动处理文件中的提醒标记
3. 根据标记创建或删除对应的日历事件

## 注意事项

- 日期格式：YYYY-MM-DD
- 时间格式：HH:mm（24小时制）
- 如果不指定结束时间，默认持续 1 小时
- 如果不指定提醒时间，默认提前 30 分钟提醒
- 已过期的提醒不会被创建
- 重复的提醒不会重复创建

## 常见问题

1. **插件没有激活？**
   - 检查 `.vscode/settings.json` 是否正确配置
   - 确认配置的文件路径是否正确
   - 查看输出面板中的日志信息

2. **提醒没有创建成功？**
   - 检查是否已授权 VSCode 访问日历
   - 确认日历应用是否正在运行
   - 检查提醒格式是否正确

## 许可证

MIT License

## 作者

HonglinZhang 
