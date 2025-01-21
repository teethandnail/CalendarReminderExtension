import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// 创建输出通道
let outputChannel: vscode.OutputChannel;

interface ReminderItem {
    date: string;
    startTime?: string;
    endTime?: string;
    title: string;
    alertMinutes: number;
    shouldDelete: boolean;
    description?: string;
}

export function activate(context: vscode.ExtensionContext) {
    // 创建输出通道
    outputChannel = vscode.window.createOutputChannel('Calendar Reminder');
    
    // 获取工作区
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return;
    }

    // 获取工作区根目录
    const workspaceRoot = workspaceFolders[0].uri.fsPath;

    // 获取配置
    const config = vscode.workspace.getConfiguration('calendarReminder', workspaceFolders[0].uri);
    const relativeTargetFile = config.get<string>('targetFile');

    // 如果没有设置目标文件，直接返回
    if (!relativeTargetFile) {
        return;
    }

    // 将相对路径转换为绝对路径
    const targetFile = vscode.Uri.file(
        path.resolve(workspaceRoot, relativeTargetFile)
    ).fsPath;

    // 检查文件是否存在
    if (!fs.existsSync(targetFile)) {
        return;
    }
    
    // 显示输出并激活监听
    outputChannel.show();
    outputChannel.appendLine('Calendar Reminder 已激活！');
    outputChannel.appendLine(`监听文件: ${targetFile}`);

    // 创建文件监听器，只监听指定文件
    const watcher = vscode.workspace.createFileSystemWatcher(targetFile);

    // 注册文件变更事件处理器
    const changeDisposable = watcher.onDidChange(async (uri) => {
        if (uri.fsPath === targetFile) {
            await processFile(uri.fsPath);
        }
    });

    const createDisposable = watcher.onDidCreate(async (uri) => {
        if (uri.fsPath === targetFile) {
            await processFile(uri.fsPath);
        }
    });

    // 监听配置变更
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('calendarReminder.targetFile')) {
                const newConfig = vscode.workspace.getConfiguration('calendarReminder', workspaceFolders[0].uri);
                const newRelativeTargetFile = newConfig.get<string>('targetFile');
                
                // 更新文件监听器
                watcher.dispose();
                if (newRelativeTargetFile) {
                    const newTargetFile = vscode.Uri.file(
                        path.resolve(workspaceRoot, newRelativeTargetFile)
                    ).fsPath;
                    const newWatcher = vscode.workspace.createFileSystemWatcher(newTargetFile);
                    context.subscriptions.push(newWatcher);
                }
            }
        })
    );

    context.subscriptions.push(watcher, changeDisposable, createDisposable);
}

async function processFile(filePath: string): Promise<void> {
    try {
        const content = await fs.promises.readFile(filePath, 'utf8');        
        const reminders = parseReminders(content);
        for (const reminder of reminders) {
            await createCalendarEvent(reminder);
        }
    } catch (err) {
        const error = err as Error;
        outputChannel.appendLine(`处理文件失败: ${error.message}`);
        console.error('处理文件失败:', error);
        vscode.window.showErrorMessage(`处理文件失败: ${error.message}`);
    }
}

function parseReminders(content: string): ReminderItem[] {
    const reminders: ReminderItem[] = [];
    const regex = /@reminder:\s*([\d-]+)(?:\s+(\d{2}:\d{2})(?:-(\d{2}:\d{2}))?)?\s+([^!]+?)(?:\s+!(\d+))?\s*(?:!delete)?(?:\n|$)/g;
    
    let match;
    while ((match = regex.exec(content)) !== null) {
        const fullMatch = match[0];  // 获取完整匹配文本
        const [_, date, startTime, endTimeRange, title, alertMinutesStr] = match;
        
        // 检查是否包含 !delete 标记
        const hasDeleteFlag = fullMatch.includes('!delete');
        
        reminders.push({
            date,
            startTime: startTime || undefined,
            endTime: endTimeRange || undefined,
            title: title.trim(),
            // 如果有数字提醒时间就用它，否则用默认值30
            alertMinutes: alertMinutesStr ? parseInt(alertMinutesStr) : 30,
            shouldDelete: hasDeleteFlag
        });
    }
    
    return reminders;
}

async function createCalendarEvent(reminder: ReminderItem): Promise<void> {
    const listCalendarsScript = `
    tell application "Calendar"
        get name of calendars
    end tell
    `.trim();

    try {
        const calendarsResult = await new Promise<string>((resolve, reject) => {
            exec(`osascript -e '${listCalendarsScript}'`, (err, stdout, stderr) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(stdout.trim());
            });
        });
        
        console.log('可用的日历:', calendarsResult);

        const calendars = calendarsResult.split(', ');
        const defaultCalendar = calendars[0];
        
        // 处理时间
        let startTime = '09:00';
        let endTime = '10:00';

        if (reminder.startTime) {
            startTime = reminder.startTime;
            if (reminder.endTime) {
                endTime = reminder.endTime;
            } else {
                const [hours, minutes] = startTime.split(':').map(Number);
                endTime = `${String(hours + 1).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
            }
        }

        // 检查事件是否已过期
        const now = new Date();
        const eventStartTime = new Date(`${reminder.date}T${startTime}:00`);
        
        if (eventStartTime < now) {
            return;
        }

        // 如果是删除操作，先检查事件是否存在
        if (reminder.shouldDelete) {
            // 使用相同的检查存在事件的脚本
            const checkExistingScript = `
            tell application "Calendar"
                tell calendar "${defaultCalendar}"
                    set startDate to current date
                    set time of startDate to 0
                    set day of startDate to ${reminder.date.split('-')[2]}
                    set month of startDate to ${reminder.date.split('-')[1]}
                    set year of startDate to ${reminder.date.split('-')[0]}
                    set hours of startDate to ${startTime.split(':')[0]}
                    set minutes of startDate to ${startTime.split(':')[1]}
                    
                    set endDate to current date
                    set time of endDate to 0
                    set day of endDate to ${reminder.date.split('-')[2]}
                    set month of endDate to ${reminder.date.split('-')[1]}
                    set year of endDate to ${reminder.date.split('-')[0]}
                    set hours of endDate to ${endTime.split(':')[0]}
                    set minutes of endDate to ${endTime.split(':')[1]}
                    
                    set existingEvents to (every event whose summary = "${reminder.title.replace(/"/g, '\\"')}" and start date = startDate and end date = endDate)
                    get (count of existingEvents) > 0
                end tell
            end tell`.trim();

            const eventExists = await new Promise<boolean>((resolve, reject) => {
                exec(`osascript -e '${checkExistingScript}'`, (err, stdout, stderr) => {
                    if (err) {
                        console.error('检查事件错误:', err);
                        reject(err);
                        return;
                    }
                    resolve(stdout.trim() === 'true');
                });
            });

            // 只有当事件存在时才执行删除
            if (eventExists) {
                const deleteScript = `
                tell application "Calendar"
                    tell calendar "${defaultCalendar}"
                        set startDate to current date
                        set time of startDate to 0
                        set day of startDate to ${reminder.date.split('-')[2]}
                        set month of startDate to ${reminder.date.split('-')[1]}
                        set year of startDate to ${reminder.date.split('-')[0]}
                        set hours of startDate to ${startTime.split(':')[0]}
                        set minutes of startDate to ${startTime.split(':')[1]}
                        
                        set endDate to current date
                        set time of endDate to 0
                        set day of endDate to ${reminder.date.split('-')[2]}
                        set month of endDate to ${reminder.date.split('-')[1]}
                        set year of endDate to ${reminder.date.split('-')[0]}
                        set hours of endDate to ${endTime.split(':')[0]}
                        set minutes of endDate to ${endTime.split(':')[1]}
                        
                        set matchingEvents to (every event whose summary = "${reminder.title.replace(/"/g, '\\"')}" and start date = startDate and end date = endDate)
                        repeat with evt in matchingEvents
                            delete evt
                        end repeat
                    end tell
                end tell`.trim();

                await new Promise<void>((resolve, reject) => {
                    exec(`osascript -e '${deleteScript}'`, (err, stdout, stderr) => {
                        if (err) {
                            outputChannel.appendLine(`删除事件错误: ${err.message}`);
                            reject(err);
                            return;
                        }
                        resolve();
                    });
                });
                
                vscode.window.showInformationMessage(`已删除日历事件：${reminder.title}`);
            }
            return;
        }

        // 修改 AppleScript 日期时间格式
        const createScript = `
        tell application "Calendar"
            tell calendar "${defaultCalendar}"
                set startDate to current date
                set time of startDate to 0
                set day of startDate to ${reminder.date.split('-')[2]}
                set month of startDate to ${reminder.date.split('-')[1]}
                set year of startDate to ${reminder.date.split('-')[0]}
                set hours of startDate to ${startTime.split(':')[0]}
                set minutes of startDate to ${startTime.split(':')[1]}
                
                set endDate to current date
                set time of endDate to 0
                set day of endDate to ${reminder.date.split('-')[2]}
                set month of endDate to ${reminder.date.split('-')[1]}
                set year of endDate to ${reminder.date.split('-')[0]}
                set hours of endDate to ${endTime.split(':')[0]}
                set minutes of endDate to ${endTime.split(':')[1]}
                
                set newEvent to make new event with properties {summary:"${reminder.title.replace(/"/g, '\\"')}", start date:startDate, end date:endDate}
                
                -- 设置提醒
                ${reminder.alertMinutes > 0 ? `
                tell newEvent
                    make new sound alarm with properties {trigger date:(start date) - (${reminder.alertMinutes} * minutes)}
                end tell
                ` : ''}
            end tell
        end tell`.trim();

        // 同样需要修改检查存在事件的脚本
        const checkExistingScript = `
        tell application "Calendar"
            tell calendar "${defaultCalendar}"
                set startDate to current date
                set time of startDate to 0
                set day of startDate to ${reminder.date.split('-')[2]}
                set month of startDate to ${reminder.date.split('-')[1]}
                set year of startDate to ${reminder.date.split('-')[0]}
                set hours of startDate to ${startTime.split(':')[0]}
                set minutes of startDate to ${startTime.split(':')[1]}
                
                set endDate to current date
                set time of endDate to 0
                set day of endDate to ${reminder.date.split('-')[2]}
                set month of endDate to ${reminder.date.split('-')[1]}
                set year of endDate to ${reminder.date.split('-')[0]}
                set hours of endDate to ${endTime.split(':')[0]}
                set minutes of endDate to ${endTime.split(':')[1]}
                
                set existingEvents to (every event whose summary = "${reminder.title.replace(/"/g, '\\"')}" and start date = startDate and end date = endDate)
                get (count of existingEvents) > 0
            end tell
        end tell`.trim();

        const eventExists = await new Promise<boolean>((resolve, reject) => {
            exec(`osascript -e '${checkExistingScript}'`, (err, stdout, stderr) => {
                if (err) {
                    console.error('检查事件错误:', err);
                    reject(err);
                    return;
                }
                resolve(stdout.trim() === 'true');
            });
        });

        if (eventExists) {
            // console.log('事件已存在，跳过创建:', reminder.title);
            // vscode.window.showInformationMessage(`事件已存在：${reminder.title}`);
            return;
        }

        await new Promise<void>((resolve, reject) => {
            console.log('执行的 AppleScript:', createScript);
            
            exec(`osascript -e '${createScript}'`, (err, stdout, stderr) => {
                if (err) {
                    console.error('AppleScript 错误:', err);
                    console.error('stderr:', stderr);
                    reject(err);
                    return;
                }
                console.log('AppleScript 输出:', stdout);
                resolve();
            });
        });
        
        vscode.window.showInformationMessage(`已创建日历事件：${reminder.title}`);
    } catch (err) {
        const error = err as Error;
        console.error('详细错误:', error);
        vscode.window.showErrorMessage(`操作日历事件失败: ${error.message}`);
    }
}

export function deactivate() {} 