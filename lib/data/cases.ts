import type { LocalCase } from "../agents/types";

export const demoPrompts = [
  "被口头辞退，工资拖欠两个月，没有签劳动合同。",
  "公司单方面解除劳动关系，理由不明确，想看仲裁风险。",
  "已经工作半年没签书面劳动合同，能否主张双倍工资？"
];

export const localCases: LocalCase[] = [
  {
    id: "cq-wage-01",
    title: "工资支付争议的本地裁判要点",
    scenario: "wage_arrears",
    scenarioLabel: "拖欠工资",
    district: "重庆市",
    year: 2021,
    summary:
      "重庆公开劳动争议典型案例中包含工资支付相关争议，适合在演示里说明欠薪主张需要结合工资流水、考勤和支付周期判断。",
    holding:
      "工资支付类争议的分析重点在金额、支付周期和证据链闭环。",
    sourceUrl:
      "https://rlsbj.cq.gov.cn/zwxx_182/tzgg/202105/t20210506_9245905.html",
    sourceLabel: "重庆市人社局公开材料",
    tags: ["欠薪", "劳动报酬", "救济路径"]
  },
  {
    id: "cq-wage-02",
    title: "一站式联调与速裁机制",
    scenario: "wage_arrears",
    scenarioLabel: "拖欠工资",
    district: "重庆市",
    year: 2023,
    summary:
      "重庆官方新闻强调一站式联调和速裁，适合在分析结果中提示用户优先走调解、仲裁和快速维权通道。",
    holding:
      "可作为重庆本地流程特色说明，不直接推导裁判偏好。",
    sourceUrl: "https://www.cq.gov.cn/ywdt/zwhd/bmdt/202311/t20231101_12499145.html",
    sourceLabel: "重庆市政府公开信息",
    tags: ["联调", "速裁", "维权路径"]
  },
  {
    id: "cq-termination-01",
    title: "违法解除劳动合同的典型争议",
    scenario: "unlawful_termination",
    scenarioLabel: "违法解除",
    district: "重庆市高级人民法院",
    year: 2020,
    summary:
      "重庆高院公开劳动争议典型案例中包含解除程序、解除理由与赔偿责任的讨论，适合用于展示违法解除争议的分析逻辑。",
    holding:
      "重点应判断解除依据、程序合法性和证据是否闭环。",
    sourceUrl:
      "https://rlsbj.cq.gov.cn/ywzl/shbx/zczs/zhl/202006/t20200604_7541602.html",
    sourceLabel: "重庆高院典型案例",
    tags: ["解除", "赔偿金", "程序合法性"]
  },
  {
    id: "cq-termination-02",
    title: "劳动争议中解除争议的裁判要点",
    scenario: "unlawful_termination",
    scenarioLabel: "违法解除",
    district: "重庆市人社局",
    year: 2021,
    summary:
      "重庆市人社局公开的劳动争议典型案例可用来展示仲裁中对解除理由、证据链和赔偿计算的本地处理方式。",
    holding:
      "适合做“结论审校”参考，不宜直接包装为必然结果。",
    sourceUrl: "https://rlsbj.cq.gov.cn/zwxx_182/tzgg/202105/t20210506_9245920.html",
    sourceLabel: "重庆市人社局典型案例",
    tags: ["仲裁", "解除", "证据链"]
  },
  {
    id: "cq-contract-01",
    title: "未签书面劳动合同的双倍工资争议",
    scenario: "no_written_contract",
    scenarioLabel: "未签合同",
    district: "重庆市",
    year: 2021,
    summary:
      "重庆公开劳动争议材料中包含未签订书面劳动合同的典型争议，适合演示双倍工资与起算时间的分析。",
    holding:
      "关键在于入职时间、合同签订时间和证据留存。",
    sourceUrl: "https://rlsbj.cq.gov.cn/zwxx_182/tzgg/202105/t20210506_9245920.html",
    sourceLabel: "重庆市人社局典型案例",
    tags: ["双倍工资", "书面合同", "起算时间"]
  },
  {
    id: "cq-contract-02",
    title: "劳动合同与程序性救济提醒",
    scenario: "no_written_contract",
    scenarioLabel: "未签合同",
    district: "重庆市",
    year: 2025,
    summary:
      "重庆现行劳动争议程序材料可用于说明仲裁申请、管辖和线上办理入口，增强本地化体验。",
    holding:
      "本地特色应落在流程和服务，不落在“判罚偏向”。",
    sourceUrl:
      "https://www.cq.gov.cn/ywdt/zwhd/bmdt/202311/t20231101_12499145.html",
    sourceLabel: "重庆市政府公开信息",
    tags: ["程序", "管辖", "申请入口"]
  },
  {
    id: "cq-wage-03",
    title: "拖欠工资证据不足的劳动报酬争议",
    scenario: "wage_arrears",
    scenarioLabel: "拖欠工资",
    district: "重庆市人力资源和社会保障局",
    year: 2021,
    summary:
      "重庆公开典型案例提示，劳动者主张长期拖欠工资时，需要同时证明实际用工、工资标准和欠付区间；如果证据与陈述不能互相印证，仲裁或法院可能不支持全额请求。",
    holding: "拖欠工资主张不能只靠口头陈述，工资标准和劳动事实都要形成闭环。",
    sourceUrl:
      "https://rlsbj.cq.gov.cn/zwxx_182/tzgg/202105/t20210506_9245920.html",
    sourceLabel: "重庆市人社局典型案例",
    tags: ["欠薪", "举证责任", "工资标准"]
  },
  {
    id: "cq-wage-04",
    title: "单方降薪引发的未足额支付劳动报酬争议",
    scenario: "wage_arrears",
    scenarioLabel: "拖欠工资",
    district: "重庆市人力资源和社会保障局",
    year: 2021,
    summary:
      "公开案例表明，用人单位单方面降低工资标准、又拿不出书面变更和合理依据时，可能构成未足额支付劳动报酬。",
    holding: "降薪必须有协商和证据支撑，不能以管理决定替代合同变更。",
    sourceUrl:
      "https://rlsbj.cq.gov.cn/zwxx_182/tzgg/202105/t20210506_9245920.html",
    sourceLabel: "重庆市人社局典型案例",
    tags: ["降薪", "未足额支付", "劳动报酬"]
  },
  {
    id: "cq-wage-05",
    title: "欠薪后被迫解除劳动关系的经济补偿",
    scenario: "wage_arrears",
    scenarioLabel: "拖欠工资",
    district: "重庆市第二中级人民法院",
    year: 2024,
    summary:
      "重庆二中法院公开案例显示，劳动者因工资长期未付申请解除后，之前发放的补助津贴不能当然抵扣解除后的经济补偿。",
    holding:
      "经济补偿要看发生在解除前还是解除后，不能把存续期补助直接等同为补偿金。",
    sourceUrl: "https://m.thepaper.cn/newsDetail_forward_27228328",
    sourceLabel: "重庆市第二中级人民法院典型案例",
    tags: ["欠薪", "被迫解除", "经济补偿"]
  },
  {
    id: "cq-termination-03",
    title: "公司搬迁后不安置员工的违法解约",
    scenario: "unlawful_termination",
    scenarioLabel: "违法解除",
    district: "重庆市第一中级人民法院",
    year: 2022,
    summary:
      "重庆一中法院公开案例提示，企业将经营设备整体搬离后，如果没有对劳动者作出合理安置并继续承认劳动关系，通常会被认定为实际单方解除。",
    holding: "搬迁不等于自动解约，企业仍要给出合法安置和解除依据。",
    sourceUrl:
      "https://cq.cqnews.net/html/2022-04/28/content_969351981790801920.html",
    sourceLabel: "重庆一中法院女职工劳动争议典型案例",
    tags: ["搬迁", "安置", "违法解除"]
  },
  {
    id: "cq-termination-04",
    title: "工会审查程序混同导致的违法解除",
    scenario: "unlawful_termination",
    scenarioLabel: "违法解除",
    district: "重庆市第三中级人民法院",
    year: 2024,
    summary:
      "重庆三中法院公开案例提示，解除前的工会审查如果由行政人员兼任、审查与决策混同，程序正当性会被削弱。",
    holding: "工会审查必须保持独立，不能用内部签字替代法定程序。",
    sourceUrl: "https://m.thepaper.cn/newsDetail_forward_27221916",
    sourceLabel: "重庆市第三中级人民法院典型案例",
    tags: ["工会程序", "程序瑕疵", "违法解除"]
  },
  {
    id: "cq-termination-05",
    title: "限制民事行为能力劳动者离职签字的效力审查",
    scenario: "unlawful_termination",
    scenarioLabel: "违法解除",
    district: "重庆市人力资源和社会保障局",
    year: 2021,
    summary:
      "公开案例提示，离职签字不当然等于真实自愿解除；如果劳动者属于限制民事行为能力人，签字效力还要结合行为能力和法定代理人追认判断。",
    holding: "解除意思表示要真实有效，不能只看签字表面。",
    sourceUrl:
      "https://rlsbj.cq.gov.cn/zwxx_182/tzgg/202105/t20210506_9245920.html",
    sourceLabel: "重庆市人社局典型案例",
    tags: ["离职签字", "法定代理人", "解除效力"]
  },
  {
    id: "cq-contract-03",
    title: "外籍劳动者工作许可下的书面合同争议",
    scenario: "no_written_contract",
    scenarioLabel: "未签合同",
    district: "重庆市人力资源和社会保障局",
    year: 2021,
    summary:
      "公开案例提示，外国人来华就业时，如果工作许可和劳动合同审批材料能够相互印证，未签书面合同的二倍工资请求未必成立。",
    holding: "书面合同争议要结合就业许可、审批材料和实际签约情况综合判断。",
    sourceUrl:
      "https://rlsbj.cq.gov.cn/zwxx_182/tzgg/202105/t20210506_9245920.html",
    sourceLabel: "重庆市人社局典型案例",
    tags: ["外籍劳动者", "双倍工资", "工作许可"]
  },
  {
    id: "cq-contract-04",
    title: "劳务外包名义下的书面合同争议",
    scenario: "no_written_contract",
    scenarioLabel: "未签合同",
    district: "重庆市第三中级人民法院",
    year: 2024,
    summary:
      "重庆三中法院公开案例提示，个人独资企业借劳务外包转移用工风险、又未与劳动者签订书面合同的，仍可能承担双倍工资和解除赔偿责任。",
    holding: "外包名义不能当然免除书面合同义务，重点仍看实际用工控制。",
    sourceUrl: "https://m.thepaper.cn/newsDetail_forward_27221916",
    sourceLabel: "重庆市第三中级人民法院典型案例",
    tags: ["劳务外包", "书面合同", "双倍工资"]
  },
  {
    id: "cq-mixed-01",
    title: "孕期女职工被停保解约的复合争议",
    scenario: "mixed",
    scenarioLabel: "混合争议",
    district: "重庆市第一中级人民法院",
    year: 2022,
    summary:
      "重庆一中法院公开案例显示，孕期女职工被停缴社保并终止劳动关系后，往往会同时牵出解除赔偿、欠付工资和生育保险待遇等问题。",
    holding: "三期保护、工资支付和社保责任应放在同一案情里一起审查。",
    sourceUrl:
      "https://cq.cqnews.net/html/2022-04/28/content_969351981790801920.html",
    sourceLabel: "重庆一中法院女职工劳动争议典型案例",
    tags: ["孕期", "停保", "欠付工资", "违法解除"]
  },
  {
    id: "cq-mixed-02",
    title: "关联企业混同用工下的工资和合同争议",
    scenario: "mixed",
    scenarioLabel: "混合争议",
    district: "重庆市第一中级人民法院",
    year: 2024,
    summary:
      "华龙网报道的重庆一中法院案例显示，关联企业交叉发薪、交替参保并不罕见，这类案子通常同时涉及工资归属、书面合同和被迫解除。",
    holding: "先锁定实际用工主体，再分别核算工资、合同和解除责任。",
    sourceUrl:
      "https://news.cqnews.net/1/detail/1234950361595191296/app/content_1234950361595191296.html",
    sourceLabel: "重庆一中法院涉关联企业劳动纠纷典型案例",
    tags: ["关联企业", "混同用工", "书面合同", "被迫解除"]
  },
  {
    id: "cq-mixed-03",
    title: "孕产期女职工解聘中的工资和合同复合争议",
    scenario: "mixed",
    scenarioLabel: "混合争议",
    district: "重庆市第三中级人民法院",
    year: 2024,
    summary:
      "重庆三中法院公开案例中，孕产期女职工被解聘后，往往会同时主张违法解除赔偿、欠付工资和未签书面合同的二倍工资差额。",
    holding: "三期女职工案件要把工资、合同和解除赔偿同步审查。",
    sourceUrl: "https://m.thepaper.cn/newsDetail_forward_27221916",
    sourceLabel: "重庆市第三中级人民法院典型案例",
    tags: ["孕产期", "欠付工资", "未签合同", "二倍工资"]
  },
  {
    id: "cq-overtime-01",
    title: "加班费与工时争议的公开参考要点",
    scenario: "overtime",
    scenarioLabel: "加班费/工时争议",
    district: "全国典型案例（重庆场景参考）",
    year: 2021,
    summary:
      "最高法和人社部发布的加班典型案例可用于重庆场景测试，重点审查工时制度、加班安排、审批记录和实际工作证据。",
    holding: "加班费争议不能只看制度审批，还要结合实际安排、打卡、排班和工作成果判断。",
    sourceUrl: "https://www.court.gov.cn/zixun/xiangqing/319151.html",
    sourceLabel: "最高人民法院、人社部典型案例",
    tags: ["加班", "工时", "排班", "加班费"]
  },
  {
    id: "cq-labor-relation-01",
    title: "平台和外包用工劳动关系认定参考",
    scenario: "labor_relation",
    scenarioLabel: "劳动关系认定",
    district: "全国典型案例（重庆场景参考）",
    year: 2023,
    summary:
      "新就业形态典型案例适合用于重庆平台用工场景测试，重点判断管理从属性、经济从属性、排班奖惩和收入结算方式。",
    holding: "合同名称不是决定因素，应回到实际用工控制和管理规则。",
    sourceUrl: "https://www.court.gov.cn/zixun/xiangqing/401172.html",
    sourceLabel: "最高人民法院、人社部新就业形态典型案例",
    tags: ["劳动关系", "平台", "骑手", "外包", "承揽"]
  },
  {
    id: "cq-social-insurance-01",
    title: "社保停缴与待遇损失的重庆复合争议",
    scenario: "social_insurance",
    scenarioLabel: "社会保险争议",
    district: "重庆市第一中级人民法院",
    year: 2022,
    summary:
      "重庆公开女职工劳动争议案例中，停缴社保和解除关系常与工资、生育待遇或其他社保待遇损失交织出现。",
    holding: "社保争议应区分行政补缴、待遇差额和用人单位过错赔偿。",
    sourceUrl:
      "https://cq.cqnews.net/html/2022-04/28/content_969351981790801920.html",
    sourceLabel: "重庆一中法院女职工劳动争议典型案例",
    tags: ["社保", "停保", "生育保险", "待遇损失"]
  },
  {
    id: "cq-work-injury-01",
    title: "工伤待遇与停工留薪期公开参考",
    scenario: "work_injury",
    scenarioLabel: "工伤待遇争议",
    district: "重庆市高级人民法院",
    year: 2020,
    summary:
      "重庆高院公开劳动争议案例材料包含工伤主体责任和待遇审查要点，适合用于工伤认定、停工留薪期和待遇差额分析。",
    holding: "工伤待遇争议应先确认工伤认定、诊断材料、停工留薪期和劳动能力鉴定。",
    sourceUrl:
      "https://rlsbj.cq.gov.cn/zwxx_182/tzgg/202105/t20210506_9245905.html",
    sourceLabel: "重庆市高级人民法院公开材料",
    tags: ["工伤", "停工留薪", "诊断证明", "劳动能力鉴定"]
  },
  {
    id: "cq-female-protection-01",
    title: "孕期女职工调岗降薪争议参考",
    scenario: "female_protection",
    scenarioLabel: "女职工特殊保护",
    district: "重庆市第一中级人民法院",
    year: 2022,
    summary:
      "重庆一中法院女职工劳动争议公开案例可用于分析孕期、产期、哺乳期中的调岗、降薪、停保和解除风险。",
    holding: "三期保护场景应同时审查岗位调整必要性、工资变化和解除程序。",
    sourceUrl:
      "https://cq.cqnews.net/html/2022-04/28/content_969351981790801920.html",
    sourceLabel: "重庆一中法院女职工劳动争议典型案例",
    tags: ["怀孕", "孕期", "调岗", "降薪", "女职工"]
  },
  {
    id: "cq-non-compete-01",
    title: "竞业限制主体和补偿审查参考",
    scenario: "non_compete",
    scenarioLabel: "竞业限制争议",
    district: "全国司法解释（重庆场景适用）",
    year: 2025,
    summary:
      "劳动争议司法解释（二）回应竞业限制主体、补偿和限制范围问题，可作为重庆场景中的全国法源参考。",
    holding: "竞业限制要审查人员是否适格、是否接触商业秘密、补偿是否支付以及限制范围是否合理。",
    sourceUrl: "https://www.court.gov.cn/zixun/xiangqing/472691.html",
    sourceLabel: "最高人民法院司法解释（二）",
    tags: ["竞业限制", "商业秘密", "补偿", "限制范围"]
  },
  {
    id: "cq-pay-benefits-01",
    title: "年休假、最低工资和停工停产待遇参考",
    scenario: "pay_benefits",
    scenarioLabel: "工资福利/休假争议",
    district: "全国典型案例（重庆场景参考）",
    year: 2020,
    summary:
      "工资福利和休假类争议通常需要拆分最低工资、年休假、停工停产工资、生活费或服务期违约金等不同规则。",
    holding: "工资福利类请求要先拆项目，再分别对应工资标准、休假年限、停工周期和服务期协议。",
    sourceUrl: "https://www.sdcourt.gov.cn/whhcqfy/377956/377958/7385637/index.html",
    sourceLabel: "公开劳动争议典型案例",
    tags: ["年休假", "最低工资", "停工停产", "生活费", "培训服务期"]
  }
];
