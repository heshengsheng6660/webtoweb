import React, { useState, useEffect } from 'react';
import { Layout, Upload, Button, Space, Card, Input, message, AutoComplete } from 'antd';
import { UploadOutlined, LeftOutlined, RightOutlined, RobotOutlined, ExclamationCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import * as XLSX from 'xlsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './App.css';

const { Header, Content, Footer } = Layout;
const { TextArea } = Input;

interface ModelResponse {
  query: string;
  responses: string[];
  scores: number[];
  comments: string[];
}

const factLabels = [
  { name: "【事实-严重-核心事实错误】", desc: "题目中明确提出的核心事实（如人物、时间、地点、定义、数据等）回答错误" },
  { name: "【事实-严重-时效性陈旧】", desc: "回答使用的数据较为陈旧" },
  { name: "【事实-严重-拒答】", desc: "面对题目核心事实类提问，模型直接拒答且未提供任何有效事实信息" },
  { name: "【事实-一般-事实错误】", desc: "回答中出现较多可查证事实错误，虽非题目直接询问，但影响整体准确性。" },
  { name: "【事实-一般-核心事实错误】", desc: "多问问题回答中，存在核心事实错误，但错误占比不超过全部核心事实需求的一半" },
  { name: "【事实-一般-内容存疑】", desc: "回答中出现不能被证实的事实的答案" }
];

const qualityLabels = [
  { name: "【质量问题-态度-鲜明】", desc: "适用于应表达明确立场的问题中，模型态度不清晰..." },
  { name: "【质量问题-思路-切题】", desc: "未围绕目标核心问题展开，论述跑题..." },
  { name: "【质量问题-思路-逻辑】", desc: "推理链不完整、论证矛盾..." },
  { name: "【质量问题-深度-针对性】", desc: "内容泛泛而谈，泛泛而谈，缺乏对提问重点的具体回应..." },
  { name: "【质量问题-深度-专业性】", desc: "内容整体专业视角、论述深度化..." },
  { name: "【质量问题-深度-可信权威/时效/来源说明】", desc: "内容缺乏权威性、时效性、来源说明..." },
  { name: "【质量问题-深度-详实-数据/案例/名言/典故】", desc: "内容缺乏有力的数据、案例、名言、典故等支撑..." },
  { name: "【质量问题-文采-文体】", desc: "未遵循题目写作体裁或体裁要求..." },
  { name: "【质量问题-文采-风格】", desc: "整体风格不佳，文风单一..." },
  { name: "【质量问题-文采-表达不当】", desc: "语言生硬、不通顺、用词不当..." },
  { name: "【质量问题-文采-未深入/过度简陋】", desc: "内容过于简陋，未展开..." },
  { name: "【质量问题-填充-堆砌/套话/书面化/模板化/机械化】", desc: "内容有明显的套话、模板化、机械化..." }
];

const DEEPSEEK_API_KEY = 'sk-74b83de4be3d49ce97e864d3f0371bee';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

// 人工检索标签常量
const manualSearchTags = [
  { label: '【事实-严重】对应的满意度都是 0分', desc: '仅问答：严重事实问题必打【事实-严重-XX】，用于事实红线指标统计（同时满意度为0分）' },
  { label: '【事实-严重-核心事实错误】', desc: '仅问答0分+文创 * 单需求（单问题）：题目直接问到的核心事实的回答出现错误或者回答不是题目直接问的事实。 * 多需求/多问题：1. 回答次序为首位的核心事实的需求存在错误；或2. 全部核心事实的需求中，回答错误的整体占比为50%及以上' },
  { label: '【事实-严重-非核心事实错误】', desc: '仅问答：response中有事实依据的但题目没有直接问到但可以查证的部分出现错误占总事实量的50%以上，包括50%' },
  { label: '【事实-严重-时效性陈旧】', desc: '仅问答：题目明确要求给出最新内容，但没有回答最新内容' },
  { label: '【事实-严重-拒答】', desc: '仅问答0分：题目直接问到的核心事实的回答直接拒答。注意问答拒答不要打到【低质-理解-拒答】（仅指直接拒答情况，没有提供任何有效的核心事实的回复，如果回答了部分有效事实不算拒答）' },
  { label: '【事实-一般】（1分）', desc: '各专项都可能有' },
  { label: '【事实-一般-事实错误】', desc: '问答：response中有事实依据的但题目没有直接问到但可以查证的部分出现错误占总事实量的30%~50%以上，包括30%。（1分）文创：事实创作中出现较多错误（0-1分）' },
  { label: '【事实-一般-核心事实错误】', desc: '仅问答（1分）仅多需求/多问题：全部核心事实的需求中，回答错误的整体占比不超过50%' },
  { label: '【事实-一般-缺失】', desc: '问答（1分）：1. 事实缺失50%以上，包括50%，e.g.,  query=23年红米、Apple推出的所有手机；或2. 核心结论缺失 文创不涉及' },
  { label: '【事实-一般-内容存疑】', desc: '' },
  { label: '【事实-轻微】（2分）', desc: '各专项都可能有' },
  { label: '【事实-轻微-事实错误】', desc: '问答：response中有事实依据的但题目没有直接问到但可以查证的部分出现错误占总事实量的10%及以上，但不超过30%。（2分）文创：事实创作出现少量错误（1-2分）' },
  { label: '【事实-轻微-缺失】', desc: '问答：事实缺失50%以下，不包括50%（2分）文创不涉及' },
  { label: '【事实-轻微-时效性陈旧】', desc: '问答：除Query中包括最新二字，模型给出的回答中没有体现最新信息 文创：要求输出时效性信息但未输出/信息陈旧' },
  { label: '【事实-轻微-内容存疑】', desc: '问答：部分事实无法查证（2分）' },
  { label: '【高质-态度】', desc: '观点立场鲜明、深入、坚定（对应【有态度】）' },
  { label: '【高质-态度-鲜明】', desc: '问答/文创：（有态度场景）（对应【有态度-端水】、【有态度-结论不突出】）- 端水：需要有态度的问题，没有给出结论（比如最终的结论是"无法直接比较"、"需要结合个人情况自己判断"）- 不突出：有结论，但是结论藏在回复中间，不够突出，不能一眼看到' },
  { label: '【高质-态度-深入】', desc: '问答/文创：（有态度场景）（对应【有态度-结论不深入】）- 虽然给了结论，但是不够深入，对用户帮助不大，类似于"如果你喜欢物理就选择物理，如果你喜欢历史就选择历史"，片汤话' },
  { label: '【高质-态度-坚定】', desc: '问答/文创：（有态度场景）中间论述过程，表达含糊，用了大量的『可能、大概、或许、不一定』（对应【有态度-不坚定】、原【低质-表达-表述模糊】） - 与结论句无关，主要是指其他的论述内容比较含糊和摇摆，不能坚定支持结论' },
  { label: '【高质-思路】', desc: '(涵盖【有理-思路】)' },
  { label: '【高质-思路-切题】', desc: '问答/文创：给出的论据和论点大量与主题没有关系，内容质量差（原【高质-深度-相关度低】）' },
  { label: '【高质-思路-逻辑】', desc: '推理计算：思路不严谨、不完备、不专业（0-2分）（原【高质-思路】）问答：论证思路不合理（1-2分）* 存在矛盾：标题总结和后续内容矛盾 * 多论据前后包含重复：多个论据概念、范围上前后包含 * 因果倒置：前提和结果倒置 * 条件不充分：论据不足以得到结果 * 非必要条件赘余：说了过多用不上的论据 * 论证链条省略过多：论证逻辑链多度简化 文创：写作结构不严谨、逻辑性差、观点不鲜明，程度轻微、严重打【低质-错误-逻辑有误】角色对话/互动陪伴：表达逻辑性差；回复策略不合适（在没有角色的情况下，简单问题也要简单回答，太长但是不属于冗余范畴，要打思路问题；如果有角色，是角色风格问题）' },
  { label: '【高质-思路-逻辑-过度反思】', desc: '过度反思、自我纠错（原【低质-表达-过度反思】）' },
  { label: '【高质-思路-次轮增益】', desc: '问答/文创-多轮（2分）：基于上一轮给出要求/补充信息，但模型回复的时候吸收不足，导致对话没有错、也遵守约束，可就是始终停留在浅薄层面，或者无法给出更多角度、更加多样化的回答（原【高质-深度-次轮增益】、【高质-全面-次轮增益】）* 文创：多轮的持续追问不满足，例如：文案的多样性和文本风格持续不满足 * 用户背景理解不到位：本轮给出了非常详细的用户个人提问背景（比如个人经历），在回答问题中模型回复无误，但是对背景吸纳了过多 * 无明确指令的Query，模型在几轮讨论中思维比较桎梏，聚焦一些领域没法给用户提供增益信息和思路扩展 * 有明确指令的Query，模型在后续轮次中不能很好的完成指令要求，轮间虽然不是完全重复但是思路拓展不清晰（开放讨论类尤其关注）' },
  { label: '【高质-思路-多模利用】', desc: '仅多模场景：多模输入本身感知、认知无误，但是回复思路欠佳，如回复中对画面中的重点内容描述少、非重点内容描述多，或角色扮演中过少或过度结合图片信息' },
  { label: '【高质-深度】', desc: '文创：内容空洞、肤浅（1-2分）(涵盖【有理-深度】) 问答：回答缺乏权威性、专业性、指导性、启发性（1-2分）' },
  { label: '【高质-深度-针对性】', desc: '回复正确相关，但空泛缺乏针对性' },
  { label: '【高质-深度-专业性】', desc: '缺乏专业深度，专业知识运用不足' },
  { label: '【高质-深度-可信-权威/时效/来源说明】', desc: '问答/文创：权威性、时效性不足（对应【有据-专业-权威/时效/来源说明】）* 来源说明 一方面是指提供reponse中的信息来源（一般在右上角可以直接点击进入网页）。如果是抓取结果导致无法判断来源说明是否权威、时效，不扣分 另一方面是正文中直接提供"根据xxx"的来源说明，如果不够权威、过于陈旧，或者完全不提权威来源，可以考虑扣分' },
  { label: '【高质-深度-详实-数据/案例/名言/典故】', desc: '问答/文创：缺乏必要的举例解释（对应【有据-详实-数据/案例/名言/典故】）' },
  { label: '【高质-全面】', desc: '文创：除指令要求外的隐含内容要素缺失（1-2分）(涵盖【有理-全面】) 信息处理：……（根据严重程度扣分） 问答：（1-2分）' },
  { label: '【高质-全面-视角多样】', desc: '问答-仅生成问答：没有从多角度/多主题综合回答论证，信息片面单一（2分）* 片面，有偏； * 缺失重要角度：缺少事件直接参与方（比如：直接当事人）； * 明确多角度问题，单角度回答； * 缺少决策的必需角度； * 起因经过结果，有明显缺失；' },
  { label: '【高质-全面-风险规避】', desc: '问答/文创：风险问题（比如医疗、法律、金融类）整体缺少风险规避的表述' },
  { label: '【高质-文采】', desc: '文采风格不佳（原【高质-风格】）(涵盖【有文采】)' },
  { label: '【高质-文采-文体】', desc: '文创：体裁格式不佳（0-2分）（如果题目要求的有强格式规范文体未遵循打【指令-风格约束-行文风格-文体】）(对应【有文采-文体不符】)*写作结构：结构不佳，比如作文写作出现小标题 *写作格式：用户未提供的信息用"XXX"代替，最好给出引导式如"[你的名字]"，打标签反映问题不扣分' },
  { label: '【高质-文采-风格-欠佳/不当】', desc: '文创：修辞不当、用词用语不佳、缺失感情共鸣、语言不生动、主题不深刻等（2分）(对应【有文采-风格不符】) 文创：营销与传播类文案吸引力、口语化、幽默等风格不佳（2分）（对应【有文采-书面感/机械感】、原【高质-风格-吸引力】） 翻译：正确但不符合原文的风格（如中式英语）' },
  { label: '【高质-文采-共情-缺失/欠佳/过度】', desc: '问答/角色：对用户的正向负向情绪没有进行合理响应，未为用户提供情绪价值体验（原【高质-共情】）' },
  { label: '【高质-文采-表述不当】', desc: '语句不通/生硬、奇怪的句子、用词不当、称呼使用错误等问题、端水、行文结构划分影响理解（如多个分点的逻辑层级不同）、关联词等逻辑用词使用不当（对应【有文采-用词不当】、原【低质-表达-表述不当】）' },
  { label: '【高质-文采-表述不当-过度简陋】', desc: '回复过于简单、敷衍，明显影响用户体验（1-2分）（原【低质-表达-过度简陋】）' },
  { label: '【高质-文采-表述不当-过度省略】', desc: '文创：多轮非首轮省略前文必要内容' },
  { label: '【高质-文采-表述不当-模板化】', desc: '明显的模板化（原【低质-表达-模板化】）问答：* 首先，其次，然后，80%的段首都有这个，有必要的衔接不扣分 * 强行拆开段落，使用衔接词：首先，其次，然后 * 总结性的话术转折词叠加使用，多次总结例如：综上所述 后 + 另外 / 此外，....... 文创：*文本穿插无必要的联结词，且有明显感知（创意写作中的朋友圈、小红书、口播文案等），强行拆开段落，使用衔接词 *句式结构单一且重复有明显感知，（每段的开头、中间或结尾段落都是相同句式结构和一样的主体，用词无变换）' },
  { label: '【高质-对话】', desc: '仅对话场景（包括单轮和多轮）反映模型对话缺乏对话感的问题' },
  { label: '【高质-对话-流畅-生硬/牵强/书面化/模板化/机械化】', desc: '模型对话不流畅、不自然（原【高质-对话-生硬/牵强/不流畅】、【高质-对话-书面化/模板化/机械化】）' },
  { label: '【高质-对话-主动-缺失/欠佳/过度】', desc: '模型在多轮对话中应适当以反问的方式呈现主动，但出现过少/不恰当/过多的主动（原【高质-主动】）' },
  { label: '【高质-对话-简短敷衍】', desc: '注意性质严重的打【高质-文采-表述不当-过度简陋】' },
  { label: '【高质-对话-多样性-语言/括号文学/情节】', desc: '角色对话/扮演：角色在多轮对话中，应该保持语言表达、建议、话题、情节设计等的多样性，避免单一、重复、雷同地回复，让用户感到无聊或缺乏进一步地帮助' },
  { label: '【低质-理解】', desc: '理解有误：跑题、隐含信息未理解等' },
  { label: '【低质-理解-异常拒答】', desc: '因误解用户需求导致拒答，注： 问答任务的拒答打【事实-严重-拒答】' },
  { label: '【低质-理解-答非所问】', desc: '完全没理解用户意图，答非所问，自顾自生成内容，写作跑题（0~1分）' },
  { label: '【低质-理解-意图误解】', desc: '对用户意图理解有偏差（-1分，可以给2分）' },
  { label: '【低质-理解-任务丢失】', desc: '多任务：只完成了部分任务，丢失了部分任务 应打到指令遵循【指令-多任务约束】' },
  { label: '【低质-理解-文字内涵】', desc: '没理解文本内容的语义、笑点、潜在含义、网络梗、脑筋急转弯；，0~2分' },
  { label: '【低质-理解-语种错误】', desc: '问答：如果问题为纯英文或者纯中文回答，回答语种错误，比如英文提问中文回答或者中文提问英文回答。1分' },
  { label: '【低质-理解-语种错误-中英夹杂】', desc: '问答：如果问题为纯英文或者纯中文回答，回答为中英夹杂（句子或则段粒度的英文中文交错，一会儿英文一会儿中文）则0分，如果个别专业词汇用非提问语种描述无问题。' },
  { label: '【低质-记忆】', desc: '仅多轮记忆问题' },
  { label: '【低质-记忆-指代消解】', desc: '多轮：你我他这样的指代消解出错，0~1分；多轮问答中0分' },
  { label: '【低质-记忆-轮间重复】', desc: '多轮：邻轮或隔轮全部内容或部分内容重复，0~1分；多轮问答中0分' },
  { label: '【低质-记忆-轮间逻辑】', desc: '多轮：邻轮或隔轮内容存在逻辑不通或矛盾，0~1分；多轮问答中0分' },
  { label: '【低质-记忆-轮间干扰】', desc: '多轮：邻轮或隔轮内容对本轮回复产生干扰，包括因前序轮错误导致后续轮错误，0~1分；多轮问答中0分' },
  { label: '【低质-记忆-多轮跳出】', desc: '多轮：回复内容脱离上下文背景，变成单轮回复，0分；' },
  { label: '【低质-记忆-遗忘-指令遗忘/回复遗忘/情境遗忘】', desc: '多轮：0~1分；多轮问答中0分；尽量打到L4' },
  { label: '【低质-错误】', desc: '' },
  { label: '【低质-错误-处理有误】', desc: '各专项除逻辑推理、数学计算外的错误，* 信息处理：非指令方面的结果错误，应尽量打出如下的细化任务问题标签：【低质-错误-处理有误-抽取】【低质-错误-处理有误-总结】【低质-错误-处理有误-分类】【低质-错误-处理有误-加工】：去重、结构化、排序【低质-错误-处理有误-纠错】【低质-错误-处理有误-解析】：解释或分析有误，语言解析、分析推断等方面的错误打这个【低质-错误-处理有误-推荐】【低质-错误-处理有误-判断】【低质-错误-处理有误-翻译】' },
  { label: '【低质-错误-逻辑有误】', desc: '各专项的逻辑维度上的错误都可以打这个标签；0~1分 文创：1.明显的前后结论矛盾、顺序错误，或者多个论点之间不是一个层级/颗粒度（细节论证不合理有瑕疵打【高质-思路】）2.逻辑关系词使用错误，比如：因为。。。既然。。。，0-2分 3.小说逻辑问题严重导致内容可用度，0-1分，轻微逻辑问题打【高质-思路】' },
  { label: '【低质-错误-逻辑有误-缺少步骤】', desc: '逻辑推理/数学计算四级标签：0-2分' },
  { label: '【低质-错误-逻辑有误-选错公式】', desc: '逻辑推理/数学计算四级标签：0-2分' },
  { label: '【低质-错误-逻辑有误-行文混乱】', desc: '问答：【低质-错误-逻辑有误-行文混乱】0~2分 模型回复的答案中，开始的结论和后续的结论及论据之间不匹配 例：开始说了一个结论A，中间论证说的是另外一件事B，结尾的结论是第三个结论C' },
  { label: '【低质-错误-计算有误】', desc: '数学计算错误，不局限推理计算任务（0-2分）；' },
  { label: '【低质-错误-计算有误-换算有误】', desc: '四级标签' },
  { label: '【低质-幻觉】', desc: '非事实性的幻觉问题，事实相关的幻觉问题参考上面的【事实问题】篇章理解：说出了文章没给的不恰当引申' },
  { label: '【低质-幻觉-自问自答】', desc: '自己提问，自己回答' },
  { label: '【低质-幻觉-胡言乱语】', desc: '生成的内容乱七八糟，乱码等等' },
  { label: '【低质-幻觉-无中生有】', desc: '文创：与query中给定内容冲突的，如用户提供的日期、姓名、联系方式等（-1分）' },
  { label: '【低质-安全】', desc: '影响安全：违背价值观、触发风险等' },
  { label: '【低质-安全-价值观】', desc: '性别歧视、种族歧视、反红色主义、社会现象等' },
  { label: '【低质-安全-兜底缺失】', desc: '风险问题应该兜底的未兜底（包括问答、文创）【不再单独考察兜底，从答案整体判断风险，存在风险可从事实、高质等维度扣分，如【高质-全面-风险规避】】' },
  { label: '【低质-安全-暴露语料】', desc: '暴露训练语料，如：『数据截止日期』、『根据参考文档』……' },
  { label: '【低质-安全-暴露系统设置】', desc: '仅SystemSetting场景暴露SystemSetting中的设置内容' },
  { label: '【低质-形式】', desc: '' },
  { label: '【低质-形式-格式混乱】', desc: '排版，大面积换行错误，中英混杂，标点缺失' },
  { label: '【低质-形式-列表混杂】', desc: '有序/无序列表混杂，大面积-2分，小面积-1分' },
  { label: '【低质-形式-异常截断】', desc: '文本生成字数并未超限制的情况下停止生成内容' },
  { label: '【低质-形式-复读机】', desc: '指大模型不断重复大面积相同的内容，打0分（原【低质-表达-复读机】）' },
  { label: '【低质-形式-括号文学有误】', desc: '角色扮演only：括号内容里出现了需要讲出来的话，根据比例，0-2分（原【低质-表达-括号文学有误】）' },
  { label: '【低质-冗余】', desc: '1. 正常情况：冗余过多时(超30%)一定要打冗余标签，扣1分（因其他问题扣到0/1分时不叠加扣分）2. 特殊情况：出现特别影响用户体验的冗余，可以不按冗余占比直接扣1分，也可以扣更多分 比如：严重的语义重复，用户直接能看出来、问题很低级恶劣。eg.推荐旅游景点的第一个和第三个是重复的' },
  { label: '【低质-冗余-表述冗余】', desc: '表述重复，信息传递效率低，车轱辘话' },
  { label: '【低质-冗余-表述冗余-重复query】', desc: '单纯复述query里已有的信息（如条件/需求/现象等），没有额外的增益' },
  { label: '【低质-冗余-表述冗余-重复结论】', desc: '单纯重复总结段或总结句' },
  { label: '【低质-冗余-表述冗余-语义重复】', desc: '生成的内容在字面或语义层面上重复 * 可能出现在小标题及内容本身，一句话里也可能存在语义重复' },
  { label: '【低质-冗余-表述冗余-衔接冗余】', desc: '出现较多不必要的衔接/过渡/铺垫的词、句、段' },
  { label: '【低质-冗余-逻辑冗余】', desc: '出现了多余推导分析过程（包括：多余的推理步骤、分析过程）' },
  { label: '【低质-冗余-逻辑冗余-过度推理】', desc: '非推理问题当做推理来做，不一定是明显的推理模版，可能是展现了不必要的模型思考、推理过程 * 推理专项不存在【过度推理】，如果推理方法用的比较复杂，打【高质-思路】' },
  { label: '【低质-冗余-逻辑冗余-强行分条】', desc: '可以合并为一条讲清楚的内容，拆分过细，并非语义重复' },
  { label: '【低质-冗余-信息冗余】', desc: '提供了与问题非直接相关的过多信息（无法判断补充信息是否为相关信息时，不扣冗余分，也不加高质分）' },
  { label: '【低质-冗余-信息冗余-过度解释】', desc: '介绍常识或用户已经熟知的信息 * 介绍具有广泛社会共知性、已被普遍认可且无需额外阐释的一般性知识 * 如：毛线帽是寒冷冬天中的常见配饰，用于头部保暖 * 基于特定受众群体已明确知晓的既定事实、常规概念等进行重复性、多余的说明解释 * 如：Query中说"我是一个计算机专业的学生"，在回答问题时，不需要介绍基础概念，如"什么是Python"' },
  { label: '【低质-冗余-信息冗余-非核心信息过多】', desc: '核心信息包括「直接回复、必要补充、高质部分」，其他都算非核心信息。拿不准是否为必要补充，先记录下来，不要扣分/加分' },
  { label: '【低质-冗余-信息冗余-拒答冗余】', desc: '拒答时给出多余信息，比如 * 对不能回答问题的理由进行过度详细的解释说明 * 在表明拒答前添加诸多无关的铺垫话语，延缓表达拒答核心意思' },
  { label: '【低质-冗余-信息冗余-过度兜底】', desc: '不需要兜底的时候出现多余的兜底，或兜底话术过于冗余 *安全价值观的场景，在拒答之后讲讲正能量是可以接受的，只要不是反复讲差不多的内容' },
  { label: '【G高质-思路】', desc: '论证思路严谨完整顺畅 * 论证逻辑严谨，让用户有感知，没有拼凑感等显著问题； * 结论先行且清晰，运用了合理行文结构（总分总、总分）；' },
  { label: '【G高质-思路-逻辑-巧妙/层次合理】', desc: '（对应【G有理-思路-巧妙/层次合理】）' },
  { label: '【G高质-思路-次轮增益】', desc: '仅多轮能够深入对话/吸纳用户特殊需求 * 深入：用户给出要求/补充信息，模型充分吸收，对话层层深入 * 某一轮次，用户有详细的背景，回答能结合用户输入背景，给出有指导性建议 * 扩展：用户寻求更多角度、多样化的回答时，能够很好地按照用户要求提供相关增益性信息、延展思路' },
  { label: '【G高质-思路-多模利用】', desc: '多模输入本身感知、认知无误的基础上，能够充分结合画面信息进行回复，信息增益大' },
  { label: '【G高质-深度】', desc: '在概念术语的深入性、推理分析的精准性、结论的新颖有洞见上有显著亮点' },
  { label: '【G高质-深度-针对性】', desc: '特别契合提问场景' },
  { label: '【G高质-深度-专业性】', desc: '专业知识使用有深度' },
  { label: '【G高质-深度-可信-权威/时效/来源说明】', desc: '问答：权威性、时效性强（对应【有据-专业-权威/时效/来源说明】）文创：时效信息加分（原【G事实-时效性】）' },
  { label: '【G高质-深度-详实-数据/案例/名言/典故】', desc: '问答/文创：能够在满足主需求的基础上，进一步提供合理的举例、真实的数据、引用原理、法律规定的原文、权威的信息源，以加深理解，或者理解更为深刻' },
  { label: '【G高质-全面】', desc: '能够全方位、多角度覆盖与主题相关的各个方面，在全面性中有显著亮点 * 多学科：从多个学科角度看问题，好像多个专家会诊； * 多角度：从事件相关各个参与方的分析； * 来龙去脉：清晰给出了事情的发展脉络、起承转合； * What、Why、How：介绍了一个事情的认知、方法论；' },
  { label: '【G高质-文采】', desc: '风格类生成效果有亮点；角色语言/行为风格有亮点（原【G高质-风格】）' },
  { label: '【G高质-文采-文体】', desc: '文创：题目无格式要求，约束条件复杂（需输出长文本，千字左右），生成内容写作结构具有亮点。偏主观 问答：回复清晰明了，让用户可以快速获得信息，合理运用大小标题、序号、强调、小标题清晰总结 * 标题层级增加：多种层级的标题，可以让读者先通过标题了解基本论点有哪些或者基本事实有哪些；或比较联系类中，灵活使用标题、加粗等Markdown格式来区别差异和被比较的内容。 * 如果强行拆分影响理解，按【低质-表达-表述不当】扣分' },
  { label: '【G高质-文采-风格】', desc: '文创：对文本描绘的整体感受，偏主观 1）用文字描绘的画面是丰富多彩的、生动； 2）节奏、音调、语言和文字的波动可以给读者带来朗朗上口的感觉； 3）文本语言丰富多样，主要指句型和修辞； 4）文本具有复杂而真诚的情感，引起读者的共鸣； 5）语言所描绘的风景、人物、形象，能带来审美感受； 6）文本传达起了深刻的主题。 7）商业文案、广告营销文案、直播脚本等营销类的写作具有吸引力，偏主观' },
  { label: '【G高质-文采-风格-用词丰富/韵律感/修辞得当/修辞新颖/意象深刻/意象新颖/富有哲理/升华得当/吸引力】', desc: '文创：对文本描绘的整体感受，偏主观 1）用文字描绘的画面是丰富多彩的、生动； 2）节奏、音调、语言和文字的波动可以给读者带来朗朗上口的感觉； 3）文本语言丰富多样，主要指句型和修辞； 4）文本具有复杂而真诚的情感，引起读者的共鸣； 5）语言所描绘的风景、人物、形象，能带来审美感受； 6）文本传达起了深刻的主题。 7）商业文案、广告营销文案、直播脚本等营销类的写作具有吸引力，偏主观' },
  { label: '【G高质-文采-风格-角色】', desc: '角色：趣味性，角色风格体现比较好，活灵活现（原【G高质-风格-角色】）' },
  { label: '【G高质-文采-共情】', desc: '对用户的正向负向情绪进行合理响应，为用户提供情绪价值体验（原【G高质-共情】）' },
  { label: '【G高质-对话】', desc: '仅对话场景（包括单轮和多轮）对话流畅自然 多轮问答：关注在对话流畅自然的基础上，重点突出' },
  { label: '【G高质-对话-多样性-语言/括号文学/情节】', desc: '角色：角色在多轮对话中，应该保持语言表达、建议、话题、情节设计等的多样性，避免单一、重复、雷同地回复，让用户感到无聊或缺乏进一步地帮助' },
  { label: '【G高质-对话-主动】', desc: '主动找话题，与用户互动，有效引导用户进行下一轮对话（原【G高质-主动】）' },
  { label: '【G高质-对话-主动-澄清】', desc: '问题给定的信息不足以给出唯一的参考答案时，可以追问信息（如果给一个答案再追问也不犯错）' },
  { label: '【G高质-对话-主动-引导】', desc: '用户问的比较笼统，这个事情需要一套流程来解决，在宽泛的回答了之后问题，说了流程之后，能够引导用户一步一步来根据刚刚说的流程继续提问解决问题。' },
  { label: '【G高质-对话-主动-激发】', desc: '回复的答案中一些信息有助于启发用户的思维和提问。' },
  { label: '【G高质-对话-主动-记忆利用】', desc: '主动利用上文信息进行回答，比如上文说明天要过生日了，下文发展到了第二天（括号文学），主动送上祝福和生日礼物' },
  { label: '【G高质-对话-态度坚定】', desc: '仅多轮模型能够在不同轮次都保持事实正确性，不会因为用户反问或疑问而改变（原【G高质-可信】）* 反问：对正确事实经得起反问，对正确的内容可以坚持 * 反复：一个问题反复问，对正确的回答不会推翻' }
];

function App() {
  const [data, setData] = useState<ModelResponse[]>([]);
  const [currentModelIndex, setCurrentModelIndex] = useState(0);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [modelNames, setModelNames] = useState<string[]>([]);
  const [displayedResponse, setDisplayedResponse] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [factCheckLoading, setFactCheckLoading] = useState(false);
  const [qualityCheckLoading, setQualityCheckLoading] = useState(false);
  const [factCheckCache, setFactCheckCache] = useState<{ [key: string]: { label: string; desc: string; reason: string } }>({});
  const [qualityCheckCache, setQualityCheckCache] = useState<{ [key: string]: { label: string; desc: string; reason: string } }>({});
  const [factCheckResult, setFactCheckResult] = useState<{ label: string; desc: string; reason: string } | null>(null);
  const [qualityCheckResult, setQualityCheckResult] = useState<{ label: string; desc: string; reason: string } | null>(null);
  const [streamCache, setStreamCache] = useState<{ [key: string]: { index: number; done: boolean } }>({});
  const [manualSearchValue, setManualSearchValue] = useState('');
  const [manualSearchOptions, setManualSearchOptions] = useState<{ value: string; label: React.ReactNode }[]>([]);

  // 流式输出效果
  useEffect(() => {
    if (data.length > 0 && currentQuestionIndex < data.length) {
      const cacheKey = `${currentQuestionIndex}_${currentModelIndex}`;
      const currentResponse = data[currentQuestionIndex].responses[currentModelIndex] || '';
      const cache = streamCache[cacheKey];
      // 如果已完成，直接显示完整内容
      if (cache && cache.done) {
        setDisplayedResponse(currentResponse);
        setIsTyping(false);
        return;
      }
      // 如果有缓存进度，从缓存index继续，否则从头
      let currentIndex = cache ? cache.index : 0;
      setIsTyping(true);
      setDisplayedResponse(currentResponse.slice(0, currentIndex));
      const typingInterval = setInterval(() => {
        if (currentIndex < currentResponse.length) {
          setDisplayedResponse(prev => prev + currentResponse[currentIndex]);
          currentIndex++;
          setStreamCache(prev => ({
            ...prev,
            [cacheKey]: { index: currentIndex, done: false }
          }));
        } else {
          clearInterval(typingInterval);
          setIsTyping(false);
          setStreamCache(prev => ({
            ...prev,
            [cacheKey]: { index: currentResponse.length, done: true }
          }));
        }
      }, 30);
      return () => clearInterval(typingInterval);
    }
    // eslint-disable-next-line
  }, [currentQuestionIndex, currentModelIndex, data]);

  // 切换题目/模型时，优先显示缓存的AI检测结果
  useEffect(() => {
    const cacheKey = `${currentQuestionIndex}_${currentModelIndex}`;
    setFactCheckResult(factCheckCache[cacheKey] || null);
    setQualityCheckResult(qualityCheckCache[cacheKey] || null);
  }, [currentQuestionIndex, currentModelIndex, factCheckCache, qualityCheckCache]);

  const handleFileUpload: UploadProps['customRequest'] = async (options) => {
    try {
      const file = options.file as File;
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const workbook = XLSX.read(e.target?.result, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        // 获取模型名称（第一行，从第二列开始）
        const models = (jsonData[0] as string[]).slice(1);
        setModelNames(models);

        // 处理数据
        const processedData = (jsonData as string[][]).slice(1).map(row => ({
          query: row[0],
          responses: row.slice(1).map(cell => cell === undefined ? '' : cell),
          scores: new Array(row.length - 1).fill(0),
          comments: new Array(row.length - 1).fill('')
        }));

        setData(processedData);
        setCurrentQuestionIndex(0);
        message.success('文件上传成功！');
      };

      reader.readAsBinaryString(file);
    } catch (error) {
      message.error('文件上传失败！');
    }
  };

  const handleScoreChange = (value: number) => {
    const newData = [...data];
    newData[currentQuestionIndex].scores[currentModelIndex] = value;
    setData(newData);
  };

  const handleCommentChange = (value: string) => {
    const newData = [...data];
    newData[currentQuestionIndex].comments[currentModelIndex] = value;
    setData(newData);
  };

  const handlePrevQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < data.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  // AI 检测函数
  const handleAICheck = async (type: 'fact' | 'quality') => {
    const cacheKey = `${currentQuestionIndex}_${currentModelIndex}`;
    if (type === 'fact') {
      setFactCheckLoading(true);
      setFactCheckResult(null);
    } else {
      setQualityCheckLoading(true);
      setQualityCheckResult(null);
    }
    try {
      const query = data[currentQuestionIndex].query;
      const answer = data[currentQuestionIndex].responses[currentModelIndex];
      const labels = type === 'fact' ? factLabels : qualityLabels;
      const labelTypeName = type === 'fact' ? '事实检测标签' : '质量问题标签';
      // prompt
      const prompt = `请根据以下${labelTypeName}体系，判断模型的回答是否存在相关问题，并返回最符合的一个标签名和理由。\n\n【输出格式要求】\n标签名：xxx\n理由：xxx（理由需结合问题和模型回答，简明扼要说明为何判定为该标签）\n\n如果没有符合要求的标签，则只回复"无符合要求的标签"。\n\n标签体系：\n${labels.map(l => l.name + '：' + l.desc).join('\n')}\n\n问题：${query}\n\n模型回答：${answer}`;
      const res = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: '你是一个标签自动评估助手。' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.1
        })
      });
      const dataRes = await res.json();
      let labelName = '';
      let reason = '';
      let isNone = false;
      if (dataRes.choices && dataRes.choices[0] && dataRes.choices[0].message && dataRes.choices[0].message.content) {
        const content = dataRes.choices[0].message.content.trim();
        if (content.includes('无符合要求的标签') || content.includes('暂未发现对应问题')) {
          isNone = true;
        } else {
          const labelMatch = content.match(/标签名[:：]\s*(.*)/);
          const reasonMatch = content.match(/理由[:：]\s*([\s\S]*)/);
          labelName = labelMatch ? labelMatch[1].split('\n')[0].trim() : '';
          reason = reasonMatch ? reasonMatch[1].trim() : '';
        }
      }
      if (isNone) {
        if (type === 'fact') {
          setFactCheckResult({ label: '暂未发现对应问题', desc: '', reason: '' });
          setFactCheckCache(prev => ({ ...prev, [cacheKey]: { label: '暂未发现对应问题', desc: '', reason: '' } }));
        } else {
          setQualityCheckResult({ label: '暂未发现对应问题', desc: '', reason: '' });
          setQualityCheckCache(prev => ({ ...prev, [cacheKey]: { label: '暂未发现对应问题', desc: '', reason: '' } }));
        }
      } else {
        const found = labels.find(l => labelName.includes(l.name));
        if (type === 'fact') {
          if (found) {
            setFactCheckResult({ label: found.name, desc: found.desc, reason });
            setFactCheckCache(prev => ({ ...prev, [cacheKey]: { label: found.name, desc: found.desc, reason } }));
          } else {
            setFactCheckResult({ label: labelName || '未识别', desc: '', reason });
            setFactCheckCache(prev => ({ ...prev, [cacheKey]: { label: labelName || '未识别', desc: '', reason } }));
          }
        } else {
          if (found) {
            setQualityCheckResult({ label: found.name, desc: found.desc, reason });
            setQualityCheckCache(prev => ({ ...prev, [cacheKey]: { label: found.name, desc: found.desc, reason } }));
          } else {
            setQualityCheckResult({ label: labelName || '未识别', desc: '', reason });
            setQualityCheckCache(prev => ({ ...prev, [cacheKey]: { label: labelName || '未识别', desc: '', reason } }));
          }
        }
      }
    } catch (e) {
      if (type === 'fact') {
        setFactCheckResult({ label: '检测失败', desc: '', reason: '' });
        setFactCheckCache(prev => ({ ...prev, [cacheKey]: { label: '检测失败', desc: '', reason: '' } }));
      } else {
        setQualityCheckResult({ label: '检测失败', desc: '', reason: '' });
        setQualityCheckCache(prev => ({ ...prev, [cacheKey]: { label: '检测失败', desc: '', reason: '' } }));
      }
    }
    if (type === 'fact') setFactCheckLoading(false);
    else setQualityCheckLoading(false);
  };

  // 标签颜色分类函数
  function getAiLabelClass(label: string) {
    if (label.includes('严重')) return 'ai-label-tag ai-label-severe';
    if (label.includes('一般')) return 'ai-label-tag ai-label-normal';
    return 'ai-label-tag ai-label-other';
  }

  // 检索输入变化时，模糊匹配标签
  const handleManualSearch = (value: string) => {
    setManualSearchValue(value);
    if (!value) {
      setManualSearchOptions([]);
      return;
    }
    const options = manualSearchTags
      .filter(item => item.label.includes(value))
      .map(item => ({
        value: item.label,
        label: <div><b>{item.label}</b><br /><span style={{ color: '#888', fontSize: 13 }}>{item.desc}</span></div>
      }));
    setManualSearchOptions(options);
  };

  // 新增：快速体验按钮处理函数
  const handleQuickDemo = async () => {
    try {
      // 假设内置Excel放在 public/quick-demo.xlsx
      const res = await fetch('/quick-demo.xlsx');
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = (e) => {
        const workbook = XLSX.read(e.target?.result, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        const models = (jsonData[0] as string[]).slice(1);
        setModelNames(models);
        const processedData = (jsonData as string[][]).slice(1).map(row => ({
          query: row[0],
          responses: row.slice(1).map(cell => cell === undefined ? '' : cell),
          scores: new Array(row.length - 1).fill(0),
          comments: new Array(row.length - 1).fill('')
        }));
        setData(processedData);
        setCurrentQuestionIndex(0);
        message.success('快速体验数据加载成功！');
      };
      reader.readAsBinaryString(blob);
    } catch (error) {
      message.error('快速体验数据加载失败！');
    }
  };

  // 新首页样式判断：无数据时展示首页美化内容
  if (data.length === 0) {
    return (
      <Layout className="layout" style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #fff 0%, #f8fafc 100%)' }}>
        <Header style={{ background: 'transparent', boxShadow: 'none', padding: 0 }} />
        <Content style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: '80vh', background: 'transparent' }}>
          <div style={{ textAlign: 'center', marginTop: 32 }}>
            <h1 style={{ fontSize: 48, fontWeight: 800, color: '#222', letterSpacing: 2, marginBottom: 16 }}>AI大模型评估系统</h1>
            <div style={{ fontSize: 22, color: '#4b5563', marginBottom: 40, fontWeight: 500 }}>
              流式输出、全格式支持、真实体验、AI标签推荐、快速标签检索
            </div>
            <Space size={24}>
              <Upload
                customRequest={handleFileUpload}
                showUploadList={false}
                accept=".xlsx,.xls"
              >
                <Button type="primary" size="large" style={{ fontSize: 20, padding: '0 48px', height: 56, borderRadius: 32, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }} icon={<UploadOutlined style={{ fontSize: 24 }} />}>
                  上传评估表格
                </Button>
              </Upload>
              <Button
                type="default"
                size="large"
                style={{ fontSize: 20, padding: '0 48px', height: 56, borderRadius: 32, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
                icon={<ThunderboltOutlined style={{ fontSize: 24 }} />} 
                onClick={handleQuickDemo}
              >
                快速体验
              </Button>
            </Space>
          </div>
          {/* 动画区域整体上移，紧跟主内容 */}
          <div style={{ width: '80vw', maxWidth: 1200, aspectRatio: '21/9', margin: '40px auto 0', background: '#e0e7ef', borderRadius: 24, boxShadow: '0 4px 24px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <video
              src="/animation.mp4"
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 24 }}
              autoPlay
              loop
              muted
              playsInline
            />
          </div>
        </Content>
        <Footer style={{ textAlign: 'center', background: 'transparent', color: '#94a3b8', fontSize: 15, border: 'none', boxShadow: 'none', marginTop: 0 }}>
          © {new Date().getFullYear()} AI大模型评估系统
        </Footer>
      </Layout>
    );
  }

  return (
    <Layout className="layout">
      <Header style={{ display: 'flex', alignItems: 'center', gap: '20px', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', zIndex: 100 }}>
        <div className="main-title">AI模型回答评分系统💪🏻</div>
        <Upload
          customRequest={handleFileUpload}
          showUploadList={false}
          accept=".xlsx,.xls"
        >
          <Button icon={<UploadOutlined />}>上传Excel文件</Button>
        </Upload>
        <Space>
          {modelNames.map((name, index) => (
            <Button
              key={index}
              type={currentModelIndex === index ? 'primary' : 'default'}
              onClick={() => setCurrentModelIndex(index)}
            >
              {name}
            </Button>
          ))}
        </Space>
      </Header>
      <Content style={{ padding: '24px' }}>
        {data.length > 0 && (
          <Card className="main-card" bodyStyle={{ padding: 0, background: '#fff' }}>
            <div className="card-content">
              <div className="card-section card-query">
                <h3>Query {currentQuestionIndex + 1}: {data[currentQuestionIndex].query}</h3>
              </div>
              <div className="card-section card-answer">
                <h4>回答：</h4>
                <div className="markdown-body card-answer-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayedResponse}</ReactMarkdown>
                  {isTyping && <span className="typing-cursor">|</span>}
                </div>
              </div>
              <div className="card-section card-score">
                <h4>评分：</h4>
                <Space size="large">
                  {[1, 2, 3, 4].map((score) => (
                    <Button
                      key={score}
                      type={data[currentQuestionIndex].scores[currentModelIndex] === score ? 'primary' : 'default'}
                      onClick={() => handleScoreChange(score)}
                      size="large"
                      className="score-btn"
                    >
                      {score}分
                    </Button>
                  ))}
                </Space>
              </div>
              <div className="card-section card-ai-ref">
                <h4>AI标签参考：</h4>
                <div className="ai-check-group">
                  <div className="ai-check-block">
                    <div className="ai-check-btn-wrap">
                      <Button
                        icon={<RobotOutlined />}
                        loading={factCheckLoading}
                        onClick={() => handleAICheck('fact')}
                        disabled={factCheckLoading}
                        type="primary"
                        size="large"
                        className="ai-check-btn"
                      >
                        事实检测
                      </Button>
                    </div>
                    {factCheckResult && (
                      <div className="ai-check-result">
                        <span className={getAiLabelClass(factCheckResult.label)}>{factCheckResult.label}</span>
                        {factCheckResult.desc && <div className="ai-check-desc">{factCheckResult.desc}</div>}
                        {factCheckResult.reason && (
                          <div className="ai-reason-box">
                            <ExclamationCircleOutlined className="ai-reason-icon" />
                            <span><b>理由：</b>{factCheckResult.reason}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ height: 24 }} />
                  <div className="ai-check-block">
                    <div className="ai-check-btn-wrap">
                      <Button
                        icon={<RobotOutlined />}
                        loading={qualityCheckLoading}
                        onClick={() => handleAICheck('quality')}
                        disabled={qualityCheckLoading}
                        type="primary"
                        size="large"
                        className="ai-check-btn"
                      >
                        质量检测
                      </Button>
                    </div>
                    {qualityCheckResult && (
                      <div className="ai-check-result">
                        <span className={getAiLabelClass(qualityCheckResult.label)}>{qualityCheckResult.label}</span>
                        {qualityCheckResult.desc && <div className="ai-check-desc">{qualityCheckResult.desc}</div>}
                        {qualityCheckResult.reason && (
                          <div className="ai-reason-box">
                            <ExclamationCircleOutlined className="ai-reason-icon" />
                            <span><b>理由：</b>{qualityCheckResult.reason}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="card-section card-comment">
                <h4>备注：</h4>
                <TextArea
                  value={data[currentQuestionIndex].comments[currentModelIndex]}
                  onChange={(e) => handleCommentChange(e.target.value)}
                  rows={4}
                />
              </div>
              <div className="card-section card-manual-search">
                <h4>人工快速检索：</h4>
                <AutoComplete
                  style={{ width: '100%', maxWidth: 600 }}
                  value={manualSearchValue}
                  options={manualSearchOptions}
                  onSearch={handleManualSearch}
                  onChange={setManualSearchValue}
                  placeholder="请输入标签关键词进行检索..."
                  allowClear
                  filterOption={false}
                />
              </div>
            </div>
          </Card>
        )}
      </Content>
      <Footer style={{ 
        textAlign: 'center', 
        background: '#fff',
        padding: '12px 50px',
        boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.06)'
      }}>
        <Space>
          <Button 
            icon={<LeftOutlined />} 
            onClick={handlePrevQuestion}
            disabled={currentQuestionIndex === 0}
          >
            上一题
          </Button>
          <span style={{ margin: '0 16px' }}>
            {data.length > 0 ? `${currentQuestionIndex + 1} / ${data.length}` : '0 / 0'}
          </span>
          <Button 
            icon={<RightOutlined />} 
            onClick={handleNextQuestion}
            disabled={currentQuestionIndex === data.length - 1}
          >
            下一题
          </Button>
        </Space>
      </Footer>
    </Layout>
  );
}

export default App; 