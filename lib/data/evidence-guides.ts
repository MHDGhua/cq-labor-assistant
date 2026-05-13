export interface EvidenceGuide {
  type: string;
  label: string;
  steps: string[];
  urgent?: string;
}

export const evidenceGuides: Record<string, EvidenceGuide> = {
  "聊天记录": {
    type: "chat",
    label: "微信/短信聊天记录",
    steps: [
      "打开和老板或HR的聊天窗口",
      "长按消息 → 多选 → 选中所有相关消息",
      "点击左下角「转发」→「合并转发」→ 发给自己的文件传输助手",
      "同时逐页截图保存（截图要包含对方头像和昵称）",
      "如果金额较大（超过5万），建议去公证处做保全公证（费用约200-500元）",
    ],
    urgent: "如果担心对方删除记录，现在就先截图！微信记录一旦删除很难恢复。",
  },
  "工资发放记录": {
    type: "salary",
    label: "工资流水/银行转账",
    steps: [
      "打开手机银行APP → 找到「交易明细」或「流水查询」",
      "筛选时间范围，覆盖入职到现在",
      "截图或导出PDF（要能看到对方账户名称）",
      "也可以去银行柜台打印盖章的流水单（带身份证即可，免费）",
    ],
  },
  "考勤或打卡记录": {
    type: "attendance",
    label: "考勤/打卡记录",
    steps: [
      "如果用钉钉/企业微信：进入「考勤」→「统计」→ 导出或截图",
      "如果是指纹/人脸打卡：拍照打卡机位置，截图打卡记录页面",
      "保存排班表（如果有的话，拍照或截图）",
      "如果公司不让看记录，可以在仲裁时申请由公司提供",
    ],
  },
  "解除通知或离职说明": {
    type: "termination",
    label: "辞退/解除通知",
    steps: [
      "如果是书面通知：拍照保存原件，不要交还给公司",
      "如果是口头通知：立刻用手机录音（录音在重庆仲裁中可以作为证据）",
      "如果是微信/短信通知：截图保存，注意要包含发送时间",
      "如果被移出工作群：截图群聊记录和被移除的提示",
    ],
    urgent: "被口头辞退时，立刻打开手机录音！事后补录没有效力。",
  },
  "劳动关系辅助证据": {
    type: "relation",
    label: "证明你在这上班的材料",
    steps: [
      "工牌/工服：拍照保存，最好能看到公司名称",
      "社保记录：登录「重庆人社」APP或支付宝查询",
      "工作群：截图群名称、群成员和你的工作消息",
      "入职登记表/offer：如果有电子版，转发保存",
      "同事证人：记下2-3个同事的姓名和联系方式",
    ],
  },
};

export function getRelevantGuides(evidenceList: string[]): EvidenceGuide[] {
  const guides: EvidenceGuide[] = [];
  for (const evidence of evidenceList) {
    const guide = evidenceGuides[evidence];
    if (guide) {
      guides.push(guide);
    }
  }
  if (guides.length === 0) {
    return [
      evidenceGuides["聊天记录"],
      evidenceGuides["工资发放记录"],
      evidenceGuides["劳动关系辅助证据"],
    ];
  }
  return guides;
}
