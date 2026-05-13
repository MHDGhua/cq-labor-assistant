export interface CaseStory {
  caseId: string;
  scenario: string;
  story: string;
  result: string;
  keyTakeaway: string;
}

export const caseStories: CaseStory[] = [
  {
    caseId: "cq-wage-01",
    scenario: "wage_arrears",
    story: `小李在渝北区一家火锅店当服务员，干了8个月，老板每个月都说“下个月一起发”，结果一直拖着不给。小李保存了和老板的微信聊天记录，又去银行打了流水证明之前确实没收到工资，然后去渝北区仲裁委申请了仲裁。`,
    result: `仲裁裁决火锅店补发全部拖欠工资，还加付了25%的赔偿金。从申请到拿钱大概2个月。`,
    keyTakeaway: "微信聊天记录 + 银行流水就够了，不用请律师也能赢",
  },
  {
    caseId: "cq-termination-01",
    scenario: "unlawful_termination",
    story: `老张在九龙坡区一家制造厂干了5年，有一天主管突然说“明天不用来了”，没给任何书面通知，也没说理由。老张当天就用手机录了音，又截图保存了工作群被移除的记录，第二周就去申请了仲裁。`,
    result: "仲裁认定公司违法解除，裁决支付5个月工资的赔偿金（2N）。",
    keyTakeaway: "被口头辞退时立刻录音、截图，这就是最关键的证据",
  },
  {
    caseId: "cq-contract-01",
    scenario: "no_written_contract",
    story: "小王在江北区一家小公司做文员，入职半年了老板一直没签劳动合同。小王每个月都有银行转账的工资记录，还有工牌和打卡截图。她去仲裁委申请了未签合同的双倍工资差额。",
    result: "仲裁支持了5个月的双倍工资差额（入职满一个月后开始算）。",
    keyTakeaway: "工资流水 + 工牌/打卡记录就能证明劳动关系，不需要合同本身",
  },
  {
    caseId: "cq-overtime-01",
    scenario: "overtime",
    story: "小陈在沙坪坝区一家电商公司做客服，每天加班到晚上9点，周末也经常被叫去上班，但工资条上从来没有加班费这一项。小陈保存了钉钉打卡记录和主管在群里安排加班的截图，申请了仲裁。",
    result: "仲裁根据打卡记录核算了工作日延时加班和休息日加班的费用，公司补发了近2万元加班费。",
    keyTakeaway: "打卡记录和工作群安排截图是加班费最有力的证据",
  },
  {
    caseId: "cq-work-injury-01",
    scenario: "work_injury",
    story: "老刘在巴南区一个工地干活时从脚手架上摔下来，腿骨折了。公司只出了住院费就不管了，也不帮他申请工伤认定。老刘自己去社保局申请了工伤认定，拿到认定书后去仲裁委主张停工留薪期工资和医疗费。",
    result: "仲裁支持了停工留薪期6个月的工资、医疗费差额和一次性伤残补助金。",
    keyTakeaway: "公司不申请工伤认定，自己也可以去申请，带上诊断证明和事故经过就行",
  },
  {
    caseId: "cq-social-insurance-01",
    scenario: "social_insurance",
    story: `小赵在南岸区一家餐饮公司干了3年，发现公司从来没给她买过社保。她去社保局打印了缴费记录确认确实没有，然后以“未依法缴纳社会保险”为由提出被迫解除，同时申请经济补偿。`,
    result: "仲裁支持了被迫解除，裁决公司支付3个月工资的经济补偿金。社保补缴部分由社保局另行处理。",
    keyTakeaway: "公司不买社保，你可以主动解除合同并要求经济补偿",
  },
  {
    caseId: "cq-female-protection-01",
    scenario: "female_protection",
    story: `小周在渝中区一家公司做行政，怀孕4个月时公司说“你身体不方便，先回家休息吧”，然后就不发工资了，社保也停了。小周保存了孕检证明、公司通知的微信记录和工资突然中断的银行流水，去申请了仲裁。`,
    result: "仲裁认定公司违法解除孕期女职工，裁决支付赔偿金、补发工资和生育保险待遇损失。",
    keyTakeaway: "怀孕期间公司不能辞退你，让你回家休息但不发工资也是违法的",
  },
  {
    caseId: "cq-labor-relation-01",
    scenario: "labor_relation",
    story: `小吴在两江新区跑外卖，平台说他是“合作关系”不是员工。但小吴每天必须按平台排班上线，迟到要扣钱，请假要审批，收入也是平台按单结算。他保存了接单记录、排班表和处罚通知，去申请确认劳动关系。`,
    result: "仲裁综合考虑管理从属性，认定存在劳动关系，平台需要补缴社保和支付相关待遇。",
    keyTakeaway: "不管合同怎么写，只要平台管你的上下班、能罚你的款，就可能是劳动关系",
  },
];

export function findStoryByScenario(scenario: string): CaseStory | undefined {
  return caseStories.find((s) => s.scenario === scenario);
}
