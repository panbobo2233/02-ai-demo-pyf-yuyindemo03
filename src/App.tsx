/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Plus, FileText, User, Calendar, MapPin, Phone, Briefcase, Clock, ChevronRight, Send, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---
interface FormData {
  applicant: string;
  fillTime: string;
  workUnit: string;
  location: string;
  position: string;
  phone: string;
  startDate: string;
  endDate: string;
  leaveDays: number;
  reason: string;
  type: '因公外出' | '因私休假' | '';
  leader: string;
  specificReason: string;
  workArrangement: string;
  remark: string;
}

// --- Constants ---
const POSITIONS = ['部门总经理', '部门总经理助理', '部门副总经理', '部室经理及以下人员'];
const REASONS = ['年休假', '福利假', '病假', '事假', '调休', '婚假', '产假'];

export default function App() {
  // --- State ---
  const [formData, setFormData] = useState<FormData>({
    applicant: '潘逸梵',
    fillTime: (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')} ${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`; })(),
    workUnit: '总行_软件开发中心',
    location: '',
    position: '部室经理及以下人员',
    phone: '13000000000',
    startDate: '',
    endDate: '',
    leaveDays: 0,
    reason: '',
    type: '',
    leader: '',
    specificReason: '',
    workArrangement: '',
    remark: '',
  });

  const [isRecording, setIsRecording] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptRef = useRef<string>('');
  const interimRef = useRef<string>('');
  const lastSnRef = useRef<number>(-1);

  // Auto-dismiss toast
  useEffect(() => {
    if (toastMsg) {
      const t = setTimeout(() => setToastMsg(''), 3000);
      return () => clearTimeout(t);
    }
  }, [toastMsg]);

  // Calculate working days whenever dates change
  useEffect(() => {
    if (formData.startDate && formData.endDate) {
      const days = calculateWorkingDays(formData.startDate, formData.endDate);
      setFormData(prev => ({ ...prev, leaveDays: days }));
    }
  }, [formData.startDate, formData.endDate]);

  // --- Helpers ---
  const calculateWorkingDays = (startStr: string, endStr: string) => {
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return 0;

    let count = 0;
    const curDate = new Date(start);
    curDate.setHours(0, 0, 0, 0);
    const endDate = new Date(end);
    endDate.setHours(0, 0, 0, 0);

    while (curDate <= endDate) {
      const dayOfWeek = curDate.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        count++;
      }
      curDate.setDate(curDate.getDate() + 1);
    }
    return count;
  };

  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const getNextWeekday = (targetDay: number, ref?: Date) => {
    const today = ref || new Date();
    const cur = today.getDay();
    let days = targetDay - cur;
    if (days <= 0) days += 7;
    const r = new Date(today);
    r.setDate(today.getDate() + days);
    return r;
  };

  const parseRelativeDate = (text: string): string | null => {
    const today = new Date();
    const weekMap: Record<string, number> = { '日': 0, '天': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 };
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const nextWeek = text.match(/下[周星期]([一二三四五六日天])/);
    if (nextWeek) {
      const target = weekMap[nextWeek[1]];
      return fmt(getNextWeekday(target));
    }
    const thisWeek = text.match(/[本这][周星期]([一二三四五六日天])/);
    if (thisWeek) {
      const target = weekMap[thisWeek[1]];
      const cur = today.getDay();
      let days = target - cur;
      if (days < 0) days += 7;
      const r = new Date(today);
      r.setDate(today.getDate() + days);
      return fmt(r);
    }
    if (text.includes('明天')) {
      const r = new Date(today); r.setDate(today.getDate() + 1); return fmt(r);
    }
    if (text.includes('后天')) {
      const r = new Date(today); r.setDate(today.getDate() + 2); return fmt(r);
    }
    if (text.includes('大后天')) {
      const r = new Date(today); r.setDate(today.getDate() + 3); return fmt(r);
    }
    return null;
  };

  const resolveHalfDay = (dateStr: string, period?: 'am' | 'pm') => {
    const now = new Date();
    const isToday = dateStr === getTodayStr();
    if (period === 'am') return { start: `${dateStr}T08:30`, end: `${dateStr}T12:00` };
    if (period === 'pm') return { start: `${dateStr}T14:00`, end: `${dateStr}T17:30` };
    if (isToday && now.getHours() >= 12) return { start: `${dateStr}T14:00`, end: `${dateStr}T17:30` };
    return { start: `${dateStr}T08:30`, end: `${dateStr}T12:00` };
  };

  const handleVoiceAnalysis = async (text: string) => {
    setIsParsing(true);
    setStatusMsg('AI 解析中...');

    try {
      const today = getTodayStr();
      const systemPrompt = `你是休假表单填充助手。从口语输入中提取字段，严格按规则输出 JSON。

今天的日期：${today}（用于推算"下周三""明天"等相对日期）

=== 事由映射规则 ===
- "年假"/"年休"/"年休假" → type="因私休假", leaveReason="年休假"
- "病假" → type="因私休假", leaveReason="病假"
- "福利假"/"事假"/"调休"/"婚假"/"产假" → type="因私休假", leaveReason=对应值
- "因私休假" → type="因私休假"
- "因公外出"/"出差" → type="因公外出"

=== 半天规则 ===
- "半天"/"请半天假" → isHalfDay=true, startDate=endDate=当天（或用户指定日期）
- "上午半天"/"上午请假" → isHalfDay=true, halfDayPeriod="am"
- "下午半天"/"下午请假" → isHalfDay=true, halfDayPeriod="pm"

=== 日期规则 ===
- 以今天 ${today} 为基准推算所有相对日期
- "下周X" → 下周对应星期X的日期
- "这周X"/"本周X" → 本周对应日期
- "明天"/"后天"/"大后天" → 对应日期
- "节后第一天" → null（由系统计算）

=== 时间规则 ===
- "上午9点" → startTime="09:00"
- "下午2点半" → startTime="14:30"
- 时间精确到分钟

输出 JSON 字段（无值填 null）：
- type: "因公外出" | "因私休假"
- leaveReason: "年休假" | "福利假" | "病假" | "事假" | "调休" | "婚假" | "产假"
- startDate: YYYY-MM-DD
- endDate: YYYY-MM-DD
- startTime: HH:MM（仅半天/明确提到时间时返回）
- endTime: HH:MM（仅半天/明确提到时间时返回）
- isHalfDay: true/false
- halfDayPeriod: "am" | "pm"（仅明确说上午/下午时返回）
- location: 地点
- specificReason: 具体事由
- workArrangement: 工作安排
- remark: 备注

只输出 JSON，不要解释。`;

      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY || ''}`,
        },
        body: JSON.stringify({
          model: 'deepseek-v4-pro',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text },
          ],
          temperature: 0,
        }),
      });

      if (!response.ok) {
        throw new Error(`Deepseek API error: ${response.status}`);
      }

      const data = await response.json();
      const jsonText = data.choices?.[0]?.message?.content?.replace(/```json|```/g, '').trim() || '{}';
      const parsedData = JSON.parse(jsonText);

      // 回填逻辑：半天优先使用 LLM 返回的时间，否则用默认全天
      let sd = parsedData.startDate ? `${parsedData.startDate}T09:00` : null;
      let ed = parsedData.endDate ? `${parsedData.endDate}T18:00` : null;

      if (parsedData.isHalfDay) {
        const dateStr = parsedData.startDate || parsedData.endDate || getTodayStr();
        const range = resolveHalfDay(dateStr, parsedData.halfDayPeriod);
        if (parsedData.startTime) sd = `${dateStr}T${parsedData.startTime}`;
        else sd = range.start;
        if (parsedData.endTime) ed = `${dateStr}T${parsedData.endTime}`;
        else ed = range.end;
      } else if (parsedData.startTime || parsedData.endTime) {
        const dateStr = parsedData.startDate || parsedData.endDate || getTodayStr();
        if (parsedData.startTime) sd = `${dateStr}T${parsedData.startTime}`;
        if (parsedData.endTime) ed = `${dateStr}T${parsedData.endTime}`;
      }

      setFormData(prev => ({
        ...prev,
        type: parsedData.type || prev.type,
        reason: parsedData.leaveReason || prev.reason,
        startDate: sd || prev.startDate,
        endDate: ed || prev.endDate,
        location: parsedData.location || prev.location,
        specificReason: parsedData.specificReason || prev.specificReason,
        workArrangement: parsedData.workArrangement || prev.workArrangement,
        remark: parsedData.remark || prev.remark,
      }));

      setStatusMsg('解析完成');
      setTimeout(() => setStatusMsg(''), 2000);
    } catch (error: any) {
      console.error('LLM Parsing error', error);
      const isNetworkError = error?.message?.includes('fetch') || error?.message?.includes('network') || error?.message?.includes('Network');
      if (isNetworkError) {
        setToastMsg('网络开小差了，智能填单暂时用不了。您可以先手动填写，稍后再试。');
      } else {
        fallbackParsing(text);
        setToastMsg('智能解析没成功，可能是因为信息不完整。试试按提示的说');
      }
    } finally {
      setIsParsing(false);
    }
  };

  const fallbackParsing = (text: string) => {
    const newData: Partial<FormData> = {};

    // 事由+类型映射
    if (text.includes('年假') || text.includes('年休')) {
      newData.type = '因私休假'; newData.reason = '年休假';
    } else if (text.includes('病假')) {
      newData.type = '因私休假'; newData.reason = '病假';
    } else {
      if (text.includes('因公')) newData.type = '因公外出';
      if (text.includes('因私') || text.includes('休假')) newData.type = '因私休假';
    }
    if (!newData.reason) {
      REASONS.forEach(r => { if (text.includes(r)) newData.reason = r; });
    }

    // 半天检测
    const isHalfDay = text.includes('半天');
    const period = text.includes('下午') ? 'pm' as const : text.includes('上午') ? 'am' as const : undefined;

    // 相对日期
    const relDate = parseRelativeDate(text);
    // 绝对日期 2026年4月29日
    const dateMatch = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/g);
    let d1: string | null = null;
    let d2: string | null = null;
    if (dateMatch && dateMatch.length >= 1) {
      d1 = dateMatch[0].replace(/年|月/g, '-').replace('日', '');
      if (dateMatch.length >= 2) d2 = dateMatch[1].replace(/年|月/g, '-').replace('日', '');
    }
    if (!d1) d1 = relDate;
    if (d1 && !d2) d2 = d1;

    if (d1) {
      if (isHalfDay) {
        const range = resolveHalfDay(d1, period);
        newData.startDate = range.start;
        newData.endDate = range.end;
      } else {
        newData.startDate = `${d1}T09:00`;
        newData.endDate = `${d2}T18:00`;
      }
    }

    // 时间提取
    const timeMatch = text.match(/(上午|下午|早上|中午|晚上)?\s*(\d{1,2})点(?:(\d{1,2})分|半)?/);
    if (timeMatch) {
      let h = parseInt(timeMatch[2]);
      const m = timeMatch[3] ? parseInt(timeMatch[3]) : (timeMatch[0].includes('半') ? 30 : 0);
      const ampm = timeMatch[1];
      if (ampm === '下午' || ampm === '晚上') { if (h < 12) h += 12; }
      if (ampm === '中午' && h === 12) h = 12;
      const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const baseDate = (d1 || getTodayStr());
      if (isHalfDay) {
        const def = resolveHalfDay(baseDate, period);
        newData.startDate = `${baseDate}T${timeStr}`;
        newData.endDate = def.end;
      }
    }

    // 地点
    if (text.includes('去') || text.includes('到') || text.includes('回')) {
      const locMatch = text.match(/(?:去|到|回)\s*([^，。！？\s]{1,10})/);
      if (locMatch) newData.location = locMatch[1];
    }

    // 工作安排
    const waMatch = text.match(/(?:工作|项目)(?:已)?交接[给到]?\s*([^，。！？\s]{1,10})/);
    if (waMatch) newData.workArrangement = `已交接给${waMatch[1]}`;

    setFormData(prev => ({ ...prev, ...newData }));
  };

  const cleanupRecording = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
  };

  const startRecording = async () => {
    setInterimTranscript('');
    setFinalTranscript('');
    transcriptRef.current = '';
    interimRef.current = '';
    lastSnRef.current = -1;
    setStatusMsg('正在连接语音服务...');

    try {
      const authRes = await fetch('/api/xfyun-auth');
      const { url: wsUrl } = await authRes.json();

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          common: { app_id: 'fb756a4d' },
          business: {
            language: 'zh_cn',
            domain: 'iat',
            accent: 'mandarin',
            vad_eos: 30000,
            dwa: 'wpgs',
            ptt: 0,
          },
          data: { status: 0, format: 'audio/L16;rate=16000', encoding: 'raw' },
        }));
        setStatusMsg('');
      };

      ws.onmessage = (event) => {
        const result = JSON.parse(event.data);
        console.log('[onmessage]', JSON.stringify(result));
        if (result.code !== 0) return;
        if (result.data?.result) {
          const text = result.data.result.ws?.map((wsi: any) =>
            wsi.cw?.map((cw: any) => cw.w).join('')
          ).join('') || '';
          const sn = result.data.result.sn ?? 0;

          if (sn !== lastSnRef.current) {
            // 新句子开始了：把上一句的文本存入永久区
            if (lastSnRef.current >= 0) {
              transcriptRef.current += interimRef.current;
            }
            lastSnRef.current = sn;
          }
          // 同一句话的渐进式修正：实时更新显示
          interimRef.current = text;
          setFinalTranscript(transcriptRef.current);
          setInterimTranscript(text);
        }
      };

      ws.onerror = () => {
        setToastMsg('网络开小差了，智能填单暂时用不了。您可以先手动填写，稍后再试。');
        cleanupRecording();
        setIsRecording(false);
      };

      ws.onclose = () => {
        setIsRecording(false);
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(2048, 1, 1);

      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcm[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
        }
        const bytes = new Uint8Array(pcm.buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        ws.send(JSON.stringify({ data: { status: 1, audio: btoa(binary) } }));
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setIsRecording(true);
    } catch (error: any) {
      console.error('Start recording error:', error);
      if (error?.name === 'NotAllowedError' || error?.message?.includes('permission')) {
        setToastMsg('无法访问麦克风，请检查浏览器权限');
      } else {
        setToastMsg('网络开小差了，智能填单暂时用不了。您可以先手动填写，稍后再试。');
      }
      setIsRecording(false);
    }
  };

  const finishRecording = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    audioContextRef.current?.close();

    // 立刻抓取当前已识别的文本，防止后续异步操作丢失
    const captured = transcriptRef.current + interimRef.current;
    console.log('[finishRecording] captured text:', captured);
    console.log('[finishRecording] transcriptRef:', transcriptRef.current, 'interimRef:', interimRef.current);

    const ws = wsRef.current;
    console.log('[finishRecording] ws readyState:', ws?.readyState);

    if (ws?.readyState === WebSocket.OPEN) {
      let finalText = '';
      ws.onmessage = (event) => {
        const result = JSON.parse(event.data);
        console.log('[finishRecording] ws final message:', JSON.stringify(result));
        if (result.code === 0 && result.data?.result) {
          const text = result.data.result.ws?.map((wsi: any) =>
            wsi.cw?.map((cw: any) => cw.w).join('')
          ).join('') || '';
          finalText += text;
        }
      };
      ws.onclose = () => {
        setIsRecording(false);
        wsRef.current = null;
        const text = finalText || captured;
        console.log('[finishRecording] onclose, finalText:', finalText, 'captured:', captured, '=>', text);
        if (text) {
          handleVoiceAnalysis(text);
        } else {
          setToastMsg('没听清您说的话，可以再试一次');
        }
      };
      ws.send(JSON.stringify({ data: { status: 2 } }));
      // 兜底：1.5 秒后讯飞还没关连接，强制处理
      setTimeout(() => {
        if (wsRef.current === ws) {
          console.log('[finishRecording] timeout fallback triggered');
          try { ws.close(); } catch (e) { /* ignore */ }
          wsRef.current = null;
          setIsRecording(false);
          const text = finalText || captured;
          if (text) {
            handleVoiceAnalysis(text);
          } else {
            setToastMsg('没听清您说的话，可以再试一次');
          }
        }
      }, 1500);
    } else {
      setIsRecording(false);
      wsRef.current = null;
      if (captured) {
        handleVoiceAnalysis(captured);
      } else {
        setToastMsg('没听清您说的话，可以再试一次');
      }
    }
  };

  const cancelRecording = () => {
    transcriptRef.current = '';
    interimRef.current = '';
    cleanupRecording();
    setIsRecording(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Form Submitted:', formData);
    alert('已提交（演示模式）\n请查看控制台输出 JSON 数据');
  };

  const fillExample = () => {
    const example = "下周三到周五请3天年假回湖南探亲，期间工作已交接给张三";
    setFinalTranscript(example);
    handleVoiceAnalysis(example);
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 pb-24">
      {/* --- Toast --- */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: -40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            className="fixed top-4 left-4 right-4 z-[200] flex justify-center pointer-events-none"
          >
            <div className="bg-gray-900/90 text-white px-5 py-3 rounded-xl text-sm font-medium shadow-lg max-w-md text-center backdrop-blur">
              {toastMsg}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Sticky Header --- */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-center shadow-sm">
        <h1 className="text-lg font-bold text-gray-800">国内休假申请</h1>
      </div>

      {/* --- Banner Voice Entrance --- */}
      <div className="bg-purple-50/50 px-4 py-2 flex items-center justify-between border-b border-purple-100">
        <div className="flex items-center gap-1 text-[13px] text-purple-600">
          <span className="animate-pulse">✨</span>
          点击语音填写，申请休假更便捷！ 
          <span className="text-base">👉</span>
        </div>
        <button
          onClick={startRecording}
          className="flex items-center gap-1.5 bg-gradient-to-r from-purple-500 to-indigo-600 text-white px-3 py-1.5 rounded-full text-xs font-medium shadow-sm active:scale-95 transition-transform"
        >
          <Mic size={14} />
          语音输入
        </button>
      </div>

      {/* --- Form Section --- */}
      <form onSubmit={handleSubmit} className="max-w-md mx-auto px-4 py-4 space-y-6">
        
        {/* Section: 审批内容 */}
        <div className="space-y-1">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">审批内容</h2>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-50 flex justify-between items-center">
              <span className="text-gray-500">国内休假(外出)审批表</span>
            </div>
          </div>
        </div>

        {/* Section: 基本信息 */}
        <div className="space-y-1">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">基本信息</h2>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50">
            
            {/* Applicant */}
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <User size={18} className="text-gray-400" />
                <span className="text-gray-700">休假（外出）人</span>
              </div>
              <div className="flex items-center gap-2 bg-gray-100 px-3 py-1 rounded-full">
                <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center">
                  <User size={12} className="text-blue-600" />
                </div>
                <span className="text-sm font-medium">{formData.applicant}</span>
              </div>
            </div>

            {/* Fill Time */}
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock size={18} className="text-gray-400" />
                <span className="text-gray-700">填表时间</span>
              </div>
              <span className="text-sm text-gray-500">{formData.fillTime}</span>
            </div>

            {/* Work Unit */}
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Briefcase size={18} className="text-gray-400" />
                <span className="text-gray-700">工作单位</span>
              </div>
              <div className="flex items-center gap-2 bg-gray-100 px-3 py-1 rounded-full">
                <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center">
                  <Briefcase size={12} className="text-blue-600" />
                </div>
                <span className="text-xs font-medium">{formData.workUnit}</span>
              </div>
            </div>

            {/* Location */}
            <div className="p-4 space-y-2">
              <div className="flex items-center gap-3">
                <MapPin size={18} className="text-gray-400" />
                <span className="text-gray-700">休假（外出）地点 <span className="text-red-500">*</span></span>
              </div>
              <input
                type="text"
                required
                placeholder="请输入休假（外出）地点"
                className="w-full px-0 py-1 text-right outline-none text-gray-600 placeholder:text-gray-300"
                value={formData.location}
                onChange={e => setFormData({ ...formData, location: e.target.value })}
              />
            </div>

            {/* Position */}
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Briefcase size={18} className="text-gray-400" />
                <span className="text-gray-700">现任职务 <span className="text-red-500">*</span></span>
              </div>
              <div className="flex items-center gap-1">
                <select
                  required
                  className="appearance-none bg-transparent text-right outline-none text-gray-600 pr-1"
                  value={formData.position}
                  onChange={e => setFormData({ ...formData, position: e.target.value })}
                >
                  <option value="">请选择现任职务</option>
                  {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <ChevronRight size={16} className="text-gray-300" />
              </div>
            </div>

            {/* Phone */}
            <div className="p-4 space-y-2">
              <div className="flex items-center gap-3">
                <Phone size={18} className="text-gray-400" />
                <span className="text-gray-700">联系电话 <span className="text-red-500">*</span></span>
              </div>
              <input
                type="tel"
                required
                placeholder="请输入联系电话"
                className="w-full px-0 py-1 text-right outline-none text-gray-600 placeholder:text-gray-300"
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>

            {/* Start Time */}
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Calendar size={18} className="text-gray-400" />
                <span className="text-gray-700">起始时间 <span className="text-red-500">*</span></span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="datetime-local"
                  required
                  className="bg-transparent text-right outline-none text-gray-600"
                  value={formData.startDate}
                  onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                />
                <ChevronRight size={16} className="text-gray-300" />
              </div>
            </div>

            {/* End Time */}
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Calendar size={18} className="text-gray-400" />
                <span className="text-gray-700">截至时间 <span className="text-red-500">*</span></span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="datetime-local"
                  required
                  className="bg-transparent text-right outline-none text-gray-600"
                  value={formData.endDate}
                  onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                />
                <ChevronRight size={16} className="text-gray-300" />
              </div>
            </div>

            {/* Leave Days */}
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock size={18} className="text-gray-400" />
                <span className="text-gray-700">休假天数（工作日）</span>
              </div>
              <span className="text-lg font-bold text-blue-600">{formData.leaveDays}</span>
            </div>

            {/* Reason */}
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText size={18} className="text-gray-400" />
                <span className="text-gray-700">休假（外出）事由 <span className="text-red-500">*</span></span>
              </div>
              <div className="flex items-center gap-1">
                <select
                  required
                  className="appearance-none bg-transparent text-right outline-none text-gray-600 pr-1"
                  value={formData.reason}
                  onChange={e => setFormData({ ...formData, reason: e.target.value })}
                >
                  <option value="">请选择休假（外出）事由</option>
                  {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <ChevronRight size={16} className="text-gray-300" />
              </div>
            </div>

            {/* Type */}
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Info size={18} className="text-gray-400" />
                <span className="text-gray-700">类型 <span className="text-red-500">*</span></span>
              </div>
              <div className="flex gap-6 justify-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="type"
                    required
                    className="w-4 h-4 text-blue-600"
                    checked={formData.type === '因公外出'}
                    onChange={() => setFormData({ ...formData, type: '因公外出' })}
                  />
                  <span className="text-sm text-gray-600">因公外出</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="type"
                    required
                    className="w-4 h-4 text-blue-600"
                    checked={formData.type === '因私休假'}
                    onChange={() => setFormData({ ...formData, type: '因私休假' })}
                  />
                  <span className="text-sm text-gray-600">因私休假</span>
                </label>
              </div>
            </div>

            {/* Leader */}
            <div className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <User size={18} className="text-gray-400" />
                  <span className="text-gray-700">呈批领导</span>
                </div>
                <button type="button" className="w-8 h-8 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
                  <Plus size={18} />
                </button>
              </div>
              <input
                type="text"
                placeholder="请选择呈批领导"
                className="w-full px-0 py-1 text-right outline-none text-gray-600 placeholder:text-gray-300"
                value={formData.leader}
                onChange={e => setFormData({ ...formData, leader: e.target.value })}
              />
            </div>

            {/* Specific Reason */}
            <div className="p-4 space-y-2">
              <div className="flex items-center gap-3">
                <FileText size={18} className="text-gray-400" />
                <span className="text-gray-700">具体事由 <span className="text-red-500">*</span></span>
              </div>
              <textarea
                required
                placeholder="请输入具体事由"
                className="w-full px-0 py-1 text-left outline-none text-gray-600 placeholder:text-gray-300 min-h-[60px] resize-none"
                value={formData.specificReason}
                onChange={e => setFormData({ ...formData, specificReason: e.target.value })}
              />
            </div>

            {/* Work Arrangement */}
            <div className="p-4 space-y-2">
              <div className="flex items-center gap-3">
                <Briefcase size={18} className="text-gray-400" />
                <span className="text-gray-700">工作安排</span>
              </div>
              <input
                type="text"
                placeholder="请输入工作安排"
                className="w-full px-0 py-1 text-left outline-none text-gray-600 placeholder:text-gray-300"
                value={formData.workArrangement}
                onChange={e => setFormData({ ...formData, workArrangement: e.target.value })}
              />
            </div>

            {/* Remark */}
            <div className="p-4 space-y-2">
              <div className="flex items-center gap-3">
                <FileText size={18} className="text-gray-400" />
                <span className="text-gray-700">备注</span>
              </div>
              <input
                type="text"
                placeholder="请输入备注"
                className="w-full px-0 py-1 text-left outline-none text-gray-600 placeholder:text-gray-300"
                value={formData.remark}
                onChange={e => setFormData({ ...formData, remark: e.target.value })}
              />
            </div>

          </div>
        </div>

        {/* Submit Button */}
        <div className="pt-4">
          <button
            type="submit"
            className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-200 active:scale-[0.98] transition-transform"
          >
            提交申请
          </button>
        </div>
      </form>

      {/* --- Voice Recording Overlay --- */}
      <AnimatePresence>
        {isRecording && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md flex flex-col justify-end"
          >
            {/* Real-time transcript bubble */}
            <div className="flex-1 flex flex-col items-center justify-center px-8 text-center pb-20">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-white/90 backdrop-blur shadow-2xl rounded-3xl p-6 min-h-[120px] w-full max-w-sm flex items-center justify-center relative"
              >
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white/90 rotate-45" />
                <p className="text-gray-800 text-lg font-medium leading-relaxed">
                  {finalTranscript + interimTranscript || "正在聆听..."}
                </p>
              </motion.div>
              
              <div className="mt-8 text-white/70 text-sm">
                你可以试试说：
              </div>
              <div
                className="mt-2 bg-white/10 px-4 py-2 rounded-xl text-white text-sm border border-white/20"
              >
                “下周三到周五请3天年假回湖南探亲，期间工作已交接给张三”
              </div>
            </div>

            {/* Bottom Controls Area */}
            <div className="bg-gradient-to-t from-gray-900 via-gray-900/95 to-transparent pt-12 pb-16 px-8 flex flex-col items-center">
              {/* Pulsing Waveform */}
              <div className="flex items-center gap-1.5 h-10 mb-12">
                {[...Array(12)].map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{
                      height: [10, 24, 10, 18, 10],
                    }}
                    transition={{
                      duration: 0.5 + Math.random() * 0.5,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className="w-1 bg-purple-400 rounded-full"
                  />
                ))}
                <span className="mx-2 text-white/60 text-xs font-medium">录音中</span>
                {[...Array(12)].map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{
                      height: [10, 24, 10, 18, 10],
                    }}
                    transition={{
                      duration: 0.5 + Math.random() * 0.5,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: 0.1
                    }}
                    className="w-1 bg-purple-400 rounded-full"
                  />
                ))}
              </div>

              <div className="w-full flex items-center justify-between gap-6 max-w-sm">
                <button
                  onClick={cancelRecording}
                  className="flex flex-col items-center gap-2 group"
                >
                  <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center border border-white/20 group-active:scale-90 transition-transform">
                    <Plus className="text-white rotate-45" size={24} />
                  </div>
                  <span className="text-white/60 text-xs">取消</span>
                </button>

                <button
                  onClick={finishRecording}
                  className="flex-1 h-16 rounded-full bg-gradient-to-r from-purple-500 to-indigo-600 shadow-xl shadow-purple-500/30 flex items-center justify-center gap-2 text-white font-bold active:scale-95 transition-transform"
                >
                  <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                    <Plus className="text-white scale-75" size={16} />
                  </div>
                  我说完了
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading Overlay for Parsing */}
      <AnimatePresence>
        {isParsing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/20 backdrop-blur-sm flex items-center justify-center px-6"
          >
            <div className="bg-white rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-700 font-medium">AI 正在解析您的语音...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Nav Placeholder (to match mobile feel) */}
      <div className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-gray-100 flex items-center justify-around px-6 z-40">
        <div className="flex flex-col items-center gap-1 text-blue-600">
          <FileText size={24} />
          <span className="text-[10px] font-medium">申请</span>
        </div>
        <div className="flex flex-col items-center gap-1 text-gray-300">
          <Clock size={24} />
          <span className="text-[10px] font-medium">进度</span>
        </div>
        <div className="flex flex-col items-center gap-1 text-gray-300">
          <User size={24} />
          <span className="text-[10px] font-medium">我的</span>
        </div>
      </div>
    </div>
  );
}
