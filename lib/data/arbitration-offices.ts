export interface ArbitrationOffice {
  district: string;
  name: string;
  address: string;
  phone: string;
  hours: string;
}

export const arbitrationOffices: ArbitrationOffice[] = [
  { district: "渝北区", name: "渝北区劳动人事争议仲裁委员会", address: "重庆市渝北区双龙大道99号", phone: "023-67821862", hours: "周一至周五 9:00-12:00 14:00-17:30" },
  { district: "江北区", name: "江北区劳动人事争议仲裁委员会", address: "重庆市江北区金港新区16号", phone: "023-67854127", hours: "周一至周五 9:00-12:00 14:00-17:30" },
  { district: "渝中区", name: "渝中区劳动人事争议仲裁委员会", address: "重庆市渝中区和平路管家巷9号", phone: "023-63765114", hours: "周一至周五 9:00-12:00 14:00-17:30" },
  { district: "南岸区", name: "南岸区劳动人事争议仲裁委员会", address: "重庆市南岸区茶园新区广福大道12号", phone: "023-62988576", hours: "周一至周五 9:00-12:00 14:00-17:30" },
  { district: "沙坪坝区", name: "沙坪坝区劳动人事争议仲裁委员会", address: "重庆市沙坪坝区天星桥正街", phone: "023-65368271", hours: "周一至周五 9:00-12:00 14:00-17:30" },
  { district: "九龙坡区", name: "九龙坡区劳动人事争议仲裁委员会", address: "重庆市九龙坡区杨家坪西郊路27号", phone: "023-68780076", hours: "周一至周五 9:00-12:00 14:00-17:30" },
  { district: "大渡口区", name: "大渡口区劳动人事争议仲裁委员会", address: "重庆市大渡口区文体路126号", phone: "023-68906286", hours: "周一至周五 9:00-12:00 14:00-17:30" },
  { district: "北碚区", name: "北碚区劳动人事争议仲裁委员会", address: "重庆市北碚区双元大道196号", phone: "023-68863aboré", hours: "周一至周五 9:00-12:00 14:00-17:30" },
  { district: "巴南区", name: "巴南区劳动人事争议仲裁委员会", address: "重庆市巴南区龙洲湾龙海大道6号", phone: "023-66222865", hours: "周一至周五 9:00-12:00 14:00-17:30" },
  { district: "两江新区", name: "两江新区劳动人事争议仲裁委员会", address: "重庆市渝北区星光大道96号", phone: "023-67463830", hours: "周一至周五 9:00-12:00 14:00-17:30" },
];

export const defaultOffice: ArbitrationOffice = {
  district: "重庆市",
  name: "重庆市劳动人事争议仲裁委员会",
  address: "重庆市渝北区春华大道99号",
  phone: "023-12333",
  hours: "周一至周五 9:00-12:00 14:00-17:30",
};

export function findOffice(text: string): ArbitrationOffice {
  for (const office of arbitrationOffices) {
    if (text.includes(office.district.replace("区", "")) || text.includes(office.district)) {
      return office;
    }
  }
  return defaultOffice;
}

export interface MaterialItem {
  name: string;
  required: boolean;
  note?: string;
}

export function getMaterials(scenario: string): MaterialItem[] {
  const common: MaterialItem[] = [
    { name: "身份证原件和复印件", required: true },
    { name: "仲裁申请书（可到现场填写）", required: true },
  ];

  const scenarioMaterials: Record<string, MaterialItem[]> = {
    wage_arrears: [
      { name: "工资流水或银行转账记录", required: true },
      { name: "劳动合同（如果有）", required: false },
      { name: "考勤记录", required: false },
      { name: "欠薪相关聊天记录截图", required: false, note: "微信、短信等" },
    ],
    unlawful_termination: [
      { name: "劳动合同", required: true },
      { name: "解除/辞退通知", required: true, note: "书面、微信、短信均可" },
      { name: "工资流水", required: false },
      { name: "工作证明（工牌、社保记录等）", required: false },
    ],
    no_written_contract: [
      { name: "能证明劳动关系的材料", required: true, note: "工牌、打卡记录、工资流水、社保记录等" },
      { name: "入职时间证明", required: false },
      { name: "工资发放记录", required: false },
    ],
    overtime: [
      { name: "劳动合同", required: false },
      { name: "考勤/打卡记录", required: true },
      { name: "加班审批单或工作安排记录", required: false },
      { name: "工资条（看是否包含加班费）", required: false },
    ],
    work_injury: [
      { name: "工伤认定决定书", required: true, note: "如果还没申请，可以先去申请" },
      { name: "医院诊断证明和病历", required: true },
      { name: "劳动合同或劳动关系证明", required: true },
      { name: "医疗费用票据", required: false },
    ],
    social_insurance: [
      { name: "社保缴费记录（社保局可打印）", required: true },
      { name: "劳动合同", required: true },
      { name: "工资流水", required: false },
    ],
    labor_relation: [
      { name: "工作相关记录（接单、排班、收入）", required: true },
      { name: "合作协议或合同", required: false },
      { name: "工作群聊天记录", required: false },
      { name: "收入结算记录", required: false },
    ],
    female_protection: [
      { name: "劳动合同", required: true },
      { name: "孕检证明或医院诊断", required: true },
      { name: "辞退/调岗通知", required: true },
      { name: "工资变化记录", required: false },
    ],
    non_compete: [
      { name: "竞业限制协议", required: true },
      { name: "离职证明", required: false },
      { name: "竞业补偿支付记录", required: false },
    ],
    pay_benefits: [
      { name: "劳动合同", required: true },
      { name: "工资条或工资流水", required: true },
      { name: "请假/年假记录", required: false },
    ],
  };

  const specific = scenarioMaterials[scenario] || scenarioMaterials.wage_arrears;
  return [...common, ...specific];
}
