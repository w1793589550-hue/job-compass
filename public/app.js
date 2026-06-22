import {
  apiFetch,
  fetchAdminStats,
  fetchAdminStatus,
  loginAdmin,
  logoutAdmin,
  privacyPolicyVersion,
  refreshQuota,
  renderQuota,
} from "./client-session.js";

const strictTemplate = `请按严格模式执行企业筛选。

真实性规则：
- 所有事实必须来自本次联网搜索取得的可访问来源。
- 不得使用模型记忆，不得编造公司、岗位、薪资、新闻、争议记录或引用。
- 无法确认的信息填写“不知道”。
- 搜索不到负面记录不能证明不存在风险。
- 正文使用 [S1]、[S2] 标注证据，文末使用 MLA 格式列出实际引用的 URL 和访问日期。

用户画像：
- 年龄：{{年龄}}
- 身份：{{身份}}
- 目标城市：{{地点}}
- 指定实际区域：{{实际区域}}
- 岗位偏好：{{岗位偏好}}
- 目标数量：{{数量}} 家

企业必须同时满足：
1. 公司主体真实，能够核实为民营企业，成立时间超过 5 年。
2. 有仍可确认有效的应届生招聘岗位，并明确接受应届毕业生。
3. 实际办公地点位于 {{地点}} 的 {{实际区域}}，不得用注册地址代替办公地点。
4. 有正式校招、管培生、导师制、轮岗或结构化培养体系。
5. 有政府部门、政府媒体或权威行业协会的具体正面报道。
6. 排除金融产品销售、贷款中介、保险销售、美容服务、收费招聘和招聘代理机构。
7. 推荐岗位为 {{岗位偏好}}，排除销售和纯研发岗位。
8. 每家公司至少使用两类独立来源反向验证，一类证明招聘，另一类证明公司主体、业务或经营状态。
9. 核验劳动争议、经营异常、失信和招聘主体风险，不得使用“零仲裁”等绝对结论。

输出要求：
- 只输出完全满足全部条件的公司。
- 任意硬性条件无法确认时，不得放入最终名单。
- 若不足 {{数量}} 家，说明实际找到的数量，不得凑数。
- 输出字段按顺序固定为：序号、公司名称、细分行业、招聘状态及日期、招聘人数、岗位、应届生依据、薪资、招聘来源、实际办公地点、规模及口径、企业性质、成立时间、注册地址、培养体系证据、政府或协会报道、劳动争议与经营风险、验证结论。
- 表格后逐家公司说明反向验证过程。
- 文末只列正文实际使用的 MLA 格式来源。`;

const balancedTemplate = `请按平衡模式执行企业筛选。本模式兼顾结果数量和真实性，并使用 A、B、C 三级结果。

真实性规则：
- 所有事实必须来自本次联网搜索取得的可访问来源。
- 不得使用模型记忆补全，不得编造公司、岗位、薪资、培训、报道或风险记录。
- 无法确认的字段填写“不知道”，并说明缺少哪类证据。
- 搜索不到劳动争议不能写成“没有劳动争议”。
- 正文使用 [S1]、[S2] 标注证据，文末使用 MLA 格式列出实际引用的 URL 和访问日期。

用户画像：
- 年龄：{{年龄}}
- 身份：{{身份}}
- 目标城市：{{地点}}
- 优先实际区域：{{实际区域}}
- 岗位偏好：{{岗位偏好}}
- 目标数量：{{数量}} 家

候选企业范围：
1. 优先民营企业，成立满 3 年可正常入选。
2. 成立 1 至 3 年的企业允许进入 B 级，但必须补充真实产品、客户案例、融资、招投标、知识产权、政府项目、行业资质或持续招聘记录中的至少一项。
3. 成立不足 1 年的企业只能进入 C 级观察名单。
4. 企业规模默认 10 至 999 人。人数少于 10 人时不能直接列为 A 级。
5. 排除金融产品销售、贷款中介、保险销售、美容服务、收费招聘和招聘代理机构。
6. AI 软件、数据服务、企业 SaaS、机器视觉和智能制造公司，不能仅因经营范围含“信息技术咨询”而排除。
7. 岗位以 {{岗位偏好}} 为主，排除纯销售和纯研发岗位。实施顾问、客户成功、售前支持等岗位必须标明是否带有销售指标。

培养条件：
- 不强制要求正式管培生项目。
- 导师带教、入职培训、岗位培训、试用期学习计划、零经验培养、内部分享、反馈考核等项目中，确认任意两项即可认定存在基础培养条件。
- 只有宣传口号而没有具体安排时，培养情况填写“不知道”。

地点扩展：
1. 首先搜索 {{实际区域}}。
2. 数量不足时扩展到相邻行政区、开发区和产业园。
3. 仍不足时扩展到 {{地点}} 全市。
4. 每家公司必须区分注册地址和实际办公地点，并标记是否发生区域扩展。

证据要求：
- A、B 级每家公司至少需要一项招聘证据和一项公司主体、业务或经营证据。
- C 级可以没有当前招聘证据，但必须明确写“招聘状态不知道”，不得描述为正在招聘。
- 招聘来源可包括企业官网、企业招聘官网、BOSS 直聘、猎聘、鱼泡直聘、国家大学生就业服务平台和高校就业网。

结果分级：
- A 级：当前招聘、应届生适配、公司主体与实际业务、实际工作地点均有明确证据，至少确认两项培养安排，并有至少两类独立来源。
- B 级：当前招聘、应届生适配、公司主体与实际业务、实际工作地点均有明确证据，并有至少两类独立来源；只允许培养细节、薪资、精确规模或晋升路径中的一至两项不知道。
- C 级：公司主体和业务有证据，但当前招聘、应届生适配或实际工作地点中的任一项不知道。C 级不能描述为正在招聘或可以投递。
- 排除：触发真实性、主体、岗位性质或重大风险红线。
- 只有一条来源的公司不得进入 A 级或 B 级。

输出要求：
- 先输出 A 级，再输出 B 级、C 级和排除项。
- 若 A 级不足 {{数量}} 家，可以补充经过验证的 B、C 级，但必须分表。
- 输出字段按顺序固定为：序号、公司名称、等级、细分行业、招聘状态及日期、招聘人数、岗位、应届生依据、薪资、招聘来源、实际办公地点、区域扩展情况、规模及口径、核心业务、企业性质、成立时间、注册地址、培养证据、业务或经营证据、劳动争议与经营风险、待确认事项、验证结论。
- 为每家 B 级公司生成 2 至 4 个向 HR 补问的问题。
- 文末只列正文实际使用的 MLA 格式来源。`;

const emergingTemplate = `请按新兴企业模式执行企业筛选。本模式用于寻找持续紧跟技术、产品或商业趋势的创新型民营企业。公司可以是初创、中小型、成长型或大型企业，公开规模最低 20 人，上不封顶。

真实性规则：
- 所有事实必须来自本次联网搜索取得的可访问来源。
- 不得使用模型记忆，不得编造公司、岗位、产品、客户、融资、薪资、知识产权或引用。
- 无法确认的字段填写“不知道”，并说明缺少什么证据。
- 搜索不到负面信息不能证明企业没有风险。
- 正文使用 [S1]、[S2] 标注证据，文末使用 MLA 格式列出实际引用的 URL 和访问日期。

用户画像：
- 年龄：{{年龄}}
- 身份：{{身份}}
- 目标城市：{{地点}}
- 优先实际区域：{{实际区域}}
- 岗位偏好：{{岗位偏好}}
- 目标数量：{{数量}} 家

重点行业：
- 人工智能、大模型、AIGC、智能体、机器视觉、自然语言处理、AI SaaS、模型评测、数据服务、工业智能、机器人、智能制造、工业软件、芯片设计、自动驾驶和数字孪生。
- 也可纳入持续推出前沿产品、建设新业务或完成数字化转型的大型互联网、先进制造和科技消费企业。
- 行业关键词只用于寻找候选公司，必须另行核实公司的实际产品、业务和近期创新活动。

企业范围：
1. 优先民营企业。成立年限和是否上市不作为排除条件，重点判断企业目前是否仍有可验证的创新产品、前沿业务、技术投入或新增长方向。
2. 企业公开规模最低 20 人，上不封顶。招聘平台标注的 20 至 99 人只是小型公司示例，不是规模上限，也不是必须优先于大型企业的条件。
3. 大型企业、上市企业或成立时间较长的企业，只要持续紧跟行业发展并有近期创新业务证据，也可以进入 A、B 级。
4. 对外规模低于 20 人、无法找到公开人数口径或呈现个人工作室特征的主体，不进入 A、B 级，只能列入观察级。
5. AI 软件、数据服务、企业 SaaS、机器视觉等公司不能仅因经营范围含“信息技术咨询”而排除。
6. 排除金融产品销售、贷款中介、保险销售、美容服务、收费招聘、培训贷和招聘代理机构。

招聘与岗位：
1. A、B 级必须有可追溯的当前招聘证据。
2. 岗位应明确接受应届生、零经验人员或写明可培养。
3. 岗位以 {{岗位偏好}} 为主，也可纳入产品助理、产品运营、数据运营、模型评测、数据质量、知识库运营、项目助理、PMO、交付支持、实施顾问、客户成功、质量、供应链及传统职能岗位。
4. 排除纯销售岗位。实施、客户成功、商务运营和售前支持必须标明是否有获客、成交或提成指标。

业务持续性核验：
- A 级至少确认一项近期创新或业务持续性证据；公开信息较少时尽量确认两项。
- 可用证据包括可访问产品、客户确认案例、融资、招投标、软件著作权、专利、高新技术认定、政府项目、园区公示、持续更新的产品资料或持续招聘记录。
- 对大型企业应核验与目标岗位相关的新产品、新业务、技术项目、组织投入或人才计划，不能只凭公司知名度认定其属于新兴企业模式。
- 企业单方面发布的奖项、客户名单或融资新闻不能单独构成验证结论。

培养核验：
- 不要求正式管培生项目。
- 明确导师带教、零经验学习内容、入职培训、产品培训、试用期目标或定期内部分享中的任意一项，可以暂时认定存在基本带教可能。
- 只有“成长快”“扁平管理”“接触核心业务”等宣传语时，培养情况填写“不知道”。

地点扩展：
1. 先搜索 {{实际区域}}。
2. 结果不足时搜索同城科技园、产业园、开发区和孵化器。
3. 再扩展到相邻行政区和 {{地点}} 全市。
4. 分别记录注册地址、实际办公地址和招聘地点。

结果分级：
- A 级：当前招聘、应届生适配、公司主体与实际业务、实际工作地点、公开规模至少 20 人、近期创新证据均为“是”，至少确认一项带教安排，并有至少两类独立来源。
- B 级：上述核心条件全部为“是”，并有至少两类独立来源；只允许培养细节、薪资或次要经营信息不知道。
- 观察级：公司主体和业务有证据，但当前招聘、应届生适配、实际工作地点、公开规模至少 20 人或近期创新证据中的任一项不知道，不能描述为正在招聘。
- 排除：触发主体真实性、收费招聘、岗位伪装、重大经营或用工风险。
- 公司知名度、大公司身份或单条获奖新闻不能替代近期创新证据。

输出要求：
- 先输出 A 级，再输出 B 级、观察级和排除项。
- 若 A 级不足 {{数量}} 家，可以补充经过验证的 B 级和观察级，但必须分表。
- 输出字段按顺序固定为：序号、公司名称、等级、细分行业、招聘状态及日期、招聘人数、岗位、应届生依据、薪资、招聘来源、实际办公地点、区域扩展情况、规模及口径、核心产品或业务、企业性质、成立时间、注册地址、培养证据、产品与经营证据、融资或知识产权、劳动争议与经营风险、待确认事项、验证结论。
- 为每家 A、B 级公司提供针对性的面试核验问题。
- 文末只列正文实际使用的 MLA 格式来源。`;

const modeTemplates = {
  strict: strictTemplate,
  balanced: balancedTemplate,
  emerging: emergingTemplate,
};

const supplyChainExpansionPrompt = `候选企业补充发现路径：
- 启用“扩展供应链公司”，从目标城市的百强企业、行业龙头、重点企业名录及公开招投标关系中寻找供应商、服务商、项目实施方和配套企业。
- 中标记录只用于发现候选公司，不能单独证明企业实力、当前经营稳定、真实人数或适合应届生。
- 对供应链候选公司重新核验企业主体、实际业务、办公地点、当前招聘、应届生适配、培养证据和公开风险。
- 历史中标但没有当前招聘证据的公司只能列入观察名单，不得描述为正在招聘。
- 参保人数、招聘平台规模和官网团队人数必须分别注明口径，不得把参保人数直接解释为全员参保。
- 最终仍按当前筛选模式分级，不能因为存在中标记录而降低真实性和招聘证据要求。`;

const modeConfig = {
  strict: {
    label: "严格模式",
    mark: "S",
    title: "全部硬条件均需核实",
    description: "成立超过 5 年，优先 100 人以上；要求正式培养体系和权威正面报道，结果可能较少。",
    recommendation: "适合：成熟企业与正式校招",
    metrics: [["5+", "年"], ["100+", "人"], ["全部", "硬条件"]],
    countLabel: "全部条件必须满足",
    rules: ["确认当前应届生招聘", "实际办公地点精确匹配", "民营且成立超过 5 年", "正式校招或培养体系", "政府或协会正面报道", "排除销售与纯研发", "至少双来源交叉验证", "劳动争议与经营风险核验"],
  },
  balanced: {
    label: "平衡模式",
    mark: "B",
    title: "兼顾可靠性和结果数量",
    description: "成立原则上满 3 年，规模 10–999 人；允许部分信息待确认，并将结果分为 A、B、C 级。",
    recommendation: "推荐：大多数应届生使用",
    metrics: [["3+", "年"], ["10–999", "人"], ["A/B/C", "分级"]],
    countLabel: "核心红线 + 分级判断",
    rules: ["招聘与公司主体必须真实", "优先区域不足可扩至全市", "成立满 3 年优先", "两项基础培养证据", "正面报道作为加分项", "允许非销售型新岗位", "A/B 级至少双来源", "未知信息生成 HR 补问"],
  },
  emerging: {
    label: "新兴企业",
    mark: "N",
    title: "发现持续创新的 20 人以上企业",
    description: "以近期创新产品、前沿业务和技术投入为核心；规模最低 20 人、上不封顶，大型企业同样可以入选。",
    recommendation: "适合：前沿行业与创新型企业",
    metrics: [["20+", "最低人数"], ["不限", "规模上限"], ["创新", "强核验"]],
    countLabel: "创新证据 + 招聘真实性",
    rules: ["公开规模至少 20 人", "企业规模上不封顶", "不按成立年限排除", "核验近期创新业务", "招聘状态必须可追溯", "一项具体带教证据", "大型企业同样可入选", "知名度不能替代证据"],
  },
};

const districtMap = {
  天津市: ["和平区", "河东区", "河西区", "南开区", "河北区", "红桥区", "东丽区", "西青区", "津南区", "北辰区", "武清区", "宝坻区", "滨海新区", "宁河区", "静海区", "蓟州区"],
  北京市: ["东城区", "西城区", "朝阳区", "海淀区", "丰台区", "石景山区", "通州区", "顺义区", "昌平区", "大兴区", "房山区", "门头沟区", "怀柔区", "平谷区", "密云区", "延庆区"],
  上海市: ["黄浦区", "徐汇区", "长宁区", "静安区", "普陀区", "虹口区", "杨浦区", "浦东新区", "闵行区", "宝山区", "嘉定区", "金山区", "松江区", "青浦区", "奉贤区", "崇明区"],
  广州市: ["越秀区", "海珠区", "荔湾区", "天河区", "白云区", "黄埔区", "番禺区", "花都区", "南沙区", "从化区", "增城区"],
  深圳市: ["福田区", "罗湖区", "南山区", "盐田区", "宝安区", "龙岗区", "龙华区", "坪山区", "光明区", "大鹏新区"],
  杭州市: ["上城区", "拱墅区", "西湖区", "滨江区", "萧山区", "余杭区", "临平区", "钱塘区", "富阳区", "临安区", "桐庐县", "淳安县", "建德市"],
  成都市: ["锦江区", "青羊区", "金牛区", "武侯区", "成华区", "龙泉驿区", "青白江区", "新都区", "温江区", "双流区", "郫都区", "新津区", "简阳市", "都江堰市", "彭州市", "邛崃市", "崇州市", "金堂县", "大邑县", "蒲江县"],
};

const elements = {
  template: document.querySelector("#promptTemplate"),
  ageSelect: document.querySelector("#ageSelect"),
  ageCustom: document.querySelector("#ageCustom"),
  identitySelect: document.querySelector("#identitySelect"),
  identityCustom: document.querySelector("#identityCustom"),
  locationSelect: document.querySelector("#locationSelect"),
  locationCustom: document.querySelector("#locationCustom"),
  countSelect: document.querySelector("#countSelect"),
  countCustom: document.querySelector("#countCustom"),
  districtPicker: document.querySelector("#districtPicker"),
  districtOptions: document.querySelector("#districtOptions"),
  districtCustom: document.querySelector("#districtCustom"),
  districtHint: document.querySelector("#districtHint"),
  roleSelect: document.querySelector("#roleSelect"),
  roleCustom: document.querySelector("#roleCustom"),
  mainResumeAssistant: document.querySelector("#mainResumeAssistant"),
  mainResumeFile: document.querySelector("#mainResumeFile"),
  mainResumeFileLabel: document.querySelector("#mainResumeFileLabel"),
  mainResumeText: document.querySelector("#mainResumeText"),
  mainAnalyzeResume: document.querySelector("#mainAnalyzeResume"),
  mainResumeState: document.querySelector("#mainResumeState"),
  mainResumePlaceholder: document.querySelector("#mainResumePlaceholder"),
  mainResumeAnalysis: document.querySelector("#mainResumeAnalysis"),
  mainPrivacyConsent: document.querySelector("#mainPrivacyConsent"),
  mainRevokeConsent: document.querySelector("#mainRevokeConsent"),
  resumeSearchToggle: document.querySelector("#resumeSearchToggle"),
  useResumeAnalysis: document.querySelector("#useResumeAnalysis"),
  languageSelect: document.querySelector("#languageSelect"),
  modelSelect: document.querySelector("#modelSelect"),
  modeCards: [...document.querySelectorAll(".mode-card")],
  modeDetail: document.querySelector("#modeDetail"),
  modeDetailMark: document.querySelector(".mode-detail-mark"),
  modeDetailTitle: document.querySelector("#modeDetailTitle"),
  modeDetailDescription: document.querySelector("#modeDetailDescription"),
  modeMetrics: document.querySelector("#modeMetrics"),
  modeRecommendation: document.querySelector("#modeRecommendation"),
  templateModeLabel: document.querySelector("#templateModeLabel"),
  templateState: document.querySelector("#templateState"),
  requirements: document.querySelector(".requirements"),
  requirementsTitle: document.querySelector("#requirementsTitle"),
  ruleCount: document.querySelector("#ruleCount"),
  ruleGrid: document.querySelector("#ruleGrid"),
  generate: document.querySelector("#generateButton"),
  resultCard: document.querySelector("#resultCard"),
  resultContent: document.querySelector("#resultContent"),
  evidenceSummary: document.querySelector("#evidenceSummary"),
  downloadExcel: document.querySelector("#downloadExcel"),
  modelBadge: document.querySelector("#modelBadge"),
  apiStatus: document.querySelector("#apiStatus"),
  railApiStatus: document.querySelector("#railApiStatus"),
  quotaStatus: document.querySelector("#quotaStatus"),
  searchHint: document.querySelector("#searchHint"),
  toast: document.querySelector("#toast"),
  templatePanel: document.querySelector("#templatePanel"),
  sidebarModePill: document.querySelector("#sidebarModePill"),
  exampleMenu: document.querySelector("#exampleMenu"),
  exampleToggle: document.querySelector("#toggleExamples"),
  exampleDropdown: document.querySelector("#exampleDropdown"),
  exampleList: document.querySelector("#exampleList"),
  exampleEmpty: document.querySelector("#exampleEmpty"),
  exampleCount: document.querySelector("#exampleCount"),
  clearExamples: document.querySelector("#clearExamples"),
  supplyChainToggle: document.querySelector("#supplyChainToggle"),
  researchExpansion: document.querySelector("#researchExpansion"),
  openTemplate: document.querySelector("#openTemplate"),
  collapseTemplate: document.querySelector("#collapseTemplate"),
  railExpandTemplate: document.querySelector("#railExpandTemplate"),
  floatingAdminMode: document.querySelector("#floatingAdminMode"),
  adminModeButton: document.querySelector("#adminModeButton"),
  railAdminMode: document.querySelector("#railAdminMode"),
  adminModeState: document.querySelector("#adminModeState"),
  adminDialog: document.querySelector("#adminDialog"),
  adminPassword: document.querySelector("#adminPassword"),
  adminLoginButton: document.querySelector("#adminLoginButton"),
  adminCancel: document.querySelector("#adminCancel"),
  adminStatsCard: document.querySelector("#adminStatsCard"),
  adminStatsRefresh: document.querySelector("#adminStatsRefresh"),
  adminStatVisitors: document.querySelector("#adminStatVisitors"),
  adminStatViews: document.querySelector("#adminStatViews"),
  adminStatContactPeople: document.querySelector("#adminStatContactPeople"),
  adminStatTodayVisitors: document.querySelector("#adminStatTodayVisitors"),
  adminStatTodayViews: document.querySelector("#adminStatTodayViews"),
  adminStatContacts: document.querySelector("#adminStatContacts"),
  adminDailyBars: document.querySelector("#adminDailyBars"),
  adminHourlyBars: document.querySelector("#adminHourlyBars"),
};

const customDistricts = new Set();
const modeOrder = ["strict", "balanced", "emerging"];
let activeMode = localStorage.getItem("jobCompassMode");
if (!modeConfig[activeMode]) activeMode = "balanced";
let selectedModes;
try {
  const storedModes = JSON.parse(localStorage.getItem("jobCompassModes") || "[]");
  selectedModes = new Set(
    Array.isArray(storedModes) ? storedModes.filter((mode) => modeConfig[mode]) : [],
  );
} catch {
  selectedModes = new Set();
}
if (!selectedModes.size) selectedModes.add(activeMode);
let supplyChainEnabled = localStorage.getItem("jobCompassSupplyChain") === "true";
let currentEvidenceSources = [];
let currentExportProfile = null;
let currentResumeAnalysis = null;
let adminModeActive = false;

const storedEmergingTemplate = localStorage.getItem("jobCompassTemplate:emerging");
if (storedEmergingTemplate && /20\s*(?:至|–|-)\s*(?:99|499)|成立时间较短/.test(storedEmergingTemplate)) {
  localStorage.removeItem("jobCompassTemplate:emerging");
}

function supplyChainIsActive() {
  return supplyChainEnabled && [...selectedModes].some((mode) => mode !== "strict");
}

function renderSupplyChainControl() {
  const supported = [...selectedModes].some((mode) => mode !== "strict");
  elements.supplyChainToggle.disabled = !supported;
  elements.supplyChainToggle.checked = supported && supplyChainEnabled;
  elements.researchExpansion.classList.toggle("disabled", !supported);
  const label = elements.researchExpansion.querySelector(".switch-control b");
  label.textContent = supported ? (supplyChainEnabled ? "开启" : "关闭") : "严格模式不可用";
  if (supported && supplyChainEnabled) {
    elements.researchExpansion.querySelector(":scope > div span").textContent =
      "已启用：将从城市百强、行业龙头和招投标关系中扩充候选企业。";
  } else {
    elements.researchExpansion.querySelector(":scope > div span").textContent =
      supported
        ? "从城市百强、行业龙头和公开招投标关系中反向发现候选企业。"
        : "严格模式保持固定检索范围，不启用供应链扩展。";
  }
}

function orderedModes(modes = selectedModes) {
  return modeOrder.filter((mode) => modes.has(mode));
}

function modeSelectionKey(modes = selectedModes) {
  return orderedModes(modes).join("+");
}

function templateStorageKey(modes = selectedModes) {
  return `jobCompassTemplate:${modeSelectionKey(modes)}`;
}

function defaultTemplateForModes(modes = selectedModes) {
  const list = orderedModes(modes);
  if (list.length === 1) return modeTemplates[list[0]];
  const labels = list.map((mode) => modeConfig[mode].label).join(" + ");
  return `请按“${labels}”组合模式执行企业筛选。

组合执行规则：
- 对每个选中模式分别使用其准入条件和分级矩阵，采用并集发现候选企业，不要求同一家公司同时满足全部模式。
- 同一家公司只能出现一次，并增加“入选模式”字段，列明其满足严格模式、平衡模式或新兴企业中的哪一条轨道。
- 如果公司满足多条轨道，可并列标注；若各轨道等级不同，分别说明，不得用宽松轨道抬高严格轨道结论。
- 所有模式共同遵守联网核验、未知写“不知道”、至少双来源、招聘真实性和风险审慎规则。
- 先输出可投递公司，再输出观察级和排除项。

以下是各模式的完整规则：

${list.map((mode) => `===== ${modeConfig[mode].label} =====\n${modeTemplates[mode]}`).join("\n\n")}`;
}

function getModeTemplate(modes = selectedModes) {
  return localStorage.getItem(templateStorageKey(modes)) || defaultTemplateForModes(modes);
}

function templateIsEdited() {
  return elements.template.value !== defaultTemplateForModes();
}

function updateTemplateState() {
  const edited = templateIsEdited();
  elements.templateState.classList.toggle("edited", edited);
  elements.templateState.querySelector("span").textContent =
    edited ? "当前模式模板已自定义" : "模板与模式预设一致";
}

function renderModeSelection(modes, { saveCurrent = true, announce = false } = {}) {
  const nextModes = new Set([...modes].filter((mode) => modeConfig[mode]));
  if (!nextModes.size) return;
  if (saveCurrent && selectedModes.size) {
    localStorage.setItem(templateStorageKey(), elements.template.value);
  }

  selectedModes = nextModes;
  const modesList = orderedModes();
  activeMode = modesList.includes(activeMode) ? activeMode : modesList.at(-1);
  localStorage.setItem("jobCompassMode", activeMode);
  localStorage.setItem("jobCompassModes", JSON.stringify(modesList));

  const configs = modesList.map((mode) => modeConfig[mode]);
  const combination = modesList.length > 1;
  const label = configs.map((config) => config.label).join(" + ");
  const config = modeConfig[activeMode];
  elements.template.value = getModeTemplate();
  elements.templateModeLabel.textContent = label;
  elements.sidebarModePill.textContent = label;
  elements.modeRecommendation.textContent = combination
    ? `已组合 ${modesList.length} 条筛选轨道`
    : config.recommendation;
  elements.modeDetail.classList.toggle("emerging", !combination && activeMode === "emerging");
  elements.modeDetail.style.animation = "none";
  void elements.modeDetail.offsetWidth;
  elements.modeDetail.style.animation = "";
  elements.modeDetailMark.textContent = combination ? modesList.length : config.mark;
  elements.modeDetailTitle.textContent = combination ? `${label}并集检索` : config.title;
  elements.modeDetailDescription.textContent = combination
    ? "各模式独立判定、合并去重，并在结果中标注入选模式；不会把多套条件错误地强制相交。"
    : config.description;
  const metrics = combination
    ? [["并集", "候选发现"], [String(modesList.length), "判定轨道"], ["去重", "公司合并"]]
    : config.metrics;
  elements.modeMetrics.replaceChildren(
    ...metrics.map(([value, metricLabel]) => {
      const item = document.createElement("span");
      item.innerHTML = `<b>${escapeHtml(value)}</b>${escapeHtml(metricLabel)}`;
      return item;
    }),
  );

  for (const card of elements.modeCards) {
    const selected = selectedModes.has(card.dataset.mode);
    card.classList.toggle("active", selected);
    card.setAttribute("aria-pressed", String(selected));
  }

  elements.requirements.classList.toggle("emerging", selectedModes.has("emerging"));
  elements.requirementsTitle.textContent = combination ? `${label}组合核验条件` : `${config.label}核验条件`;
  elements.ruleCount.textContent = combination ? "分轨判断 + 合并去重" : config.countLabel;
  const rules = [...new Set(configs.flatMap((item) => item.rules))];
  elements.ruleGrid.replaceChildren(
    ...rules.map((rule, index) => {
      const item = document.createElement("span");
      item.textContent = rule;
      item.style.animationDelay = `${index * 26}ms`;
      return item;
    }),
  );
  renderSupplyChainControl();
  updateTemplateState();
  if (announce) showToast(`当前筛选：${label}`);
}

function renderMode(mode, options = {}) {
  if (!modeConfig[mode]) return;
  activeMode = mode;
  renderModeSelection(new Set([mode]), options);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove("show"), 2800);
}

function renderAdminMode(active) {
  adminModeActive = Boolean(active);
  document.body.classList.toggle("admin-mode-active", adminModeActive);
  elements.floatingAdminMode?.classList.toggle("active", adminModeActive);
  elements.adminModeButton?.classList.toggle("active", adminModeActive);
  elements.railAdminMode?.classList.toggle("active", adminModeActive);
  if (elements.floatingAdminMode) {
    elements.floatingAdminMode.setAttribute("aria-pressed", String(adminModeActive));
  }
  if (elements.adminModeButton) {
    elements.adminModeButton.setAttribute("aria-pressed", String(adminModeActive));
  }
  if (elements.railAdminMode) {
    elements.railAdminMode.setAttribute("aria-pressed", String(adminModeActive));
  }
  if (elements.adminModeState) {
    elements.adminModeState.textContent = adminModeActive ? "已启用" : "未启用";
  }
  if (elements.adminStatsCard) {
    elements.adminStatsCard.hidden = !adminModeActive;
  }
  if (adminModeActive) refreshAdminStats();
}

async function refreshAdminStats() {
  if (!adminModeActive || !elements.adminStatsCard) return;
  try {
    const stats = await fetchAdminStats();
    renderAdminStats(stats);
  } catch (error) {
    showToast(error.message || "读取管理员统计失败");
  }
}

function renderAdminStats(stats) {
  const totals = stats?.totals || {};
  if (elements.adminStatVisitors) elements.adminStatVisitors.textContent = totals.visitors || 0;
  if (elements.adminStatViews) elements.adminStatViews.textContent = totals.views || 0;
  if (elements.adminStatContactPeople) elements.adminStatContactPeople.textContent = totals.contactPeople || 0;
  if (elements.adminStatTodayVisitors) elements.adminStatTodayVisitors.textContent = `今日 ${totals.todayVisitors || 0}`;
  if (elements.adminStatTodayViews) elements.adminStatTodayViews.textContent = `今日 ${totals.todayViews || 0}`;
  if (elements.adminStatContacts) elements.adminStatContacts.textContent = `提交 ${totals.contacts || 0} 次`;
  renderAdminBars(elements.adminDailyBars, stats?.daily || []);
  renderAdminBars(elements.adminHourlyBars, stats?.hourly || []);
}

function renderAdminBars(container, points) {
  if (!container) return;
  const max = Math.max(1, ...points.map((point) => Number(point.views || 0)));
  container.replaceChildren();
  for (const point of points) {
    const bar = document.createElement("span");
    bar.className = "admin-bar";
    bar.style.height = `${Math.max(8, (Number(point.views || 0) / max) * 82)}px`;
    bar.dataset.label = point.label;
    bar.title = `${point.label}: 浏览量 ${point.views}，浏览人数 ${point.visitors}，联系 ${point.contacts}`;
    container.append(bar);
  }
}

async function refreshAdminMode() {
  try {
    const status = await fetchAdminStatus();
    renderAdminMode(status.adminMode);
    refreshQuota(elements.quotaStatus);
  } catch {
    renderAdminMode(false);
  }
}

function openAdminDialog() {
  if (!elements.adminDialog) return;
  elements.adminPassword.value = "";
  if (typeof elements.adminDialog.showModal === "function") {
    elements.adminDialog.showModal();
  } else {
    elements.adminDialog.setAttribute("open", "");
  }
  elements.adminPassword?.focus();
}

async function handleAdminModeClick() {
  if (adminModeActive) {
    await logoutAdmin();
    renderAdminMode(false);
    refreshQuota(elements.quotaStatus);
    showToast("已退出管理员模式");
    return;
  }
  openAdminDialog();
}

async function submitAdminPassword() {
  const password = elements.adminPassword?.value || "";
  if (!password.trim()) {
    showToast("请输入管理员密码");
    return;
  }
  elements.adminLoginButton.disabled = true;
  try {
    await loginAdmin(password);
    elements.adminDialog?.close();
    renderAdminMode(true);
    refreshQuota(elements.quotaStatus);
    showToast("已进入管理员模式，API 调用不再受本地额度限制");
  } catch (error) {
    showToast(error.message || "管理员登录失败");
  } finally {
    elements.adminLoginButton.disabled = false;
  }
}

for (const card of elements.modeCards) {
  card.addEventListener("click", () => {
    const mode = card.dataset.mode;
    const next = new Set(selectedModes);
    if (next.has(mode)) {
      if (next.size === 1) {
        showToast("至少保留一种筛选强度");
        return;
      }
      next.delete(mode);
    } else {
      next.add(mode);
      activeMode = mode;
    }
    renderModeSelection(next, { announce: true });
  });
  card.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = elements.modeCards.indexOf(card);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const next = elements.modeCards[(currentIndex + direction + elements.modeCards.length) % elements.modeCards.length];
    next.focus();
  });
}

elements.template.addEventListener("input", updateTemplateState);

elements.supplyChainToggle.addEventListener("change", () => {
  supplyChainEnabled = elements.supplyChainToggle.checked;
  localStorage.setItem("jobCompassSupplyChain", String(supplyChainEnabled));
  renderSupplyChainControl();
  showToast(supplyChainEnabled ? "已开启供应链公司扩展" : "已关闭供应链公司扩展");
});

function setCustomMode(select, input) {
  const token = select.closest(".field-token");
  const custom = select.value === "custom";
  token.classList.toggle("custom", custom);
  if (custom) input.focus();
  else input.value = "";
}

[
  [elements.ageSelect, elements.ageCustom],
  [elements.identitySelect, elements.identityCustom],
  [elements.locationSelect, elements.locationCustom],
  [elements.countSelect, elements.countCustom],
].forEach(([select, input]) => {
  select.addEventListener("change", () => setCustomMode(select, input));
});

function selectedDistricts() {
  return [...elements.districtOptions.querySelectorAll("input:checked")].map((input) => input.value);
}

function districtChip(name, isCustom = false) {
  const label = document.createElement("label");
  label.className = `district-chip${isCustom ? " custom-chip" : ""}`;
  label.innerHTML = `<input type="checkbox" value="${escapeAttribute(name)}"><span>${escapeHtml(name)}</span>`;
  if (isCustom) {
    label.addEventListener("dblclick", () => {
      customDistricts.delete(name);
      renderDistricts();
    });
  }
  return label;
}

function renderDistricts(preserve = []) {
  const city = elements.locationSelect.value;
  const visible = Boolean(city);
  elements.districtPicker.hidden = !visible;
  elements.districtOptions.replaceChildren();
  if (!visible) return;

  const list = city === "custom" ? [] : districtMap[city] || [];
  elements.districtHint.textContent = city === "custom"
    ? "可添加多个区、县、开发区或通勤范围"
    : `已载入 ${city} 的行政区，可同时选择多个`;

  for (const name of [...list, ...customDistricts]) {
    const chip = districtChip(name, customDistricts.has(name));
    const input = chip.querySelector("input");
    input.checked = preserve.includes(name);
    elements.districtOptions.append(chip);
  }
}

elements.locationSelect.addEventListener("change", () => {
  customDistricts.clear();
  renderDistricts();
});

elements.locationCustom.addEventListener("input", () => {
  if (elements.locationSelect.value === "custom") renderDistricts(selectedDistricts());
});

function addCustomDistrict() {
  const name = elements.districtCustom.value.trim();
  if (!name) return;
  const selected = selectedDistricts();
  customDistricts.add(name);
  elements.districtCustom.value = "";
  renderDistricts([...selected, name]);
}

document.querySelector("#addDistrict").addEventListener("click", addCustomDistrict);
elements.districtCustom.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addCustomDistrict();
  }
});
document.querySelector("#clearDistricts").addEventListener("click", () => {
  for (const input of elements.districtOptions.querySelectorAll("input")) input.checked = false;
});

elements.roleSelect.addEventListener("change", () => {
  const custom = elements.roleSelect.value === "custom";
  elements.roleSelect.closest(".role-option").classList.toggle("custom", custom);
  if (custom) elements.roleCustom.focus();
  else elements.roleCustom.value = "";
});

elements.mainResumeFile.addEventListener("change", () => {
  const file = elements.mainResumeFile.files[0];
  if (!file) {
    elements.mainResumeFileLabel.textContent = "未选择文件，也可以直接粘贴文字";
    return;
  }
  const size = file.size < 1024 * 1024
    ? `${Math.ceil(file.size / 1024)} KB`
    : `${(file.size / 1024 / 1024).toFixed(1)} MB`;
  elements.mainResumeFileLabel.textContent = `${file.name} · ${size}`;
});

function resumeFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",").pop());
    reader.onerror = () => reject(new Error("无法读取简历文件"));
    reader.readAsDataURL(file);
  });
}

function applyResumeRole(role) {
  if (!role) return;
  const current = elements.roleSelect.value === "custom"
    ? elements.roleCustom.value
      .split(/[，,、/]/)
      .map((item) => item.trim())
      .filter(Boolean)
    : [];
  elements.roleSelect.value = "custom";
  elements.roleSelect.closest(".role-option").classList.add("custom");
  elements.roleCustom.value = [...new Set([...current, role])].join("、");
  showToast(`已加入岗位偏好：${role}`);
}

function resumeTextList(title, values) {
  if (!Array.isArray(values) || !values.length) return null;
  const section = document.createElement("section");
  const heading = document.createElement("h3");
  heading.textContent = title;
  const list = document.createElement("ul");
  values.forEach((value) => {
    const item = document.createElement("li");
    item.textContent = String(value);
    list.append(item);
  });
  section.append(heading, list);
  return section;
}

function renderMainResumeAnalysis(data) {
  elements.mainResumeAnalysis.replaceChildren();

  const summary = document.createElement("div");
  summary.className = "analysis-summary";
  const label = document.createElement("span");
  label.textContent = "简历摘要";
  const text = document.createElement("p");
  text.textContent = data.summary || "不知道";
  summary.append(label, text);
  elements.mainResumeAnalysis.append(summary);

  const roles = document.createElement("section");
  roles.className = "recommended-roles";
  const heading = document.createElement("h3");
  heading.textContent = "推荐岗位方向";
  roles.append(heading);
  (data.recommendedRoles || []).forEach((item) => {
    const card = document.createElement("article");
    const head = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = item.role || "岗位方向";
    const fit = document.createElement("span");
    fit.textContent = item.fit || "待判断";
    head.append(title, fit);
    const reason = document.createElement("p");
    reason.textContent = (item.reasons || []).join("；") || "没有提供匹配理由";
    const evidence = document.createElement("small");
    evidence.textContent = `简历依据：${(item.evidenceFromResume || []).join("；") || "不知道"}`;
    const apply = document.createElement("button");
    apply.type = "button";
    apply.textContent = "加入岗位偏好";
    apply.addEventListener("click", () => {
      applyResumeRole(item.role);
      apply.textContent = "已加入";
      apply.disabled = true;
    });
    card.append(head, reason, evidence, apply);
    roles.append(card);
  });
  elements.mainResumeAnalysis.append(roles);

  [
    resumeTextList("已有优势", data.strengths),
    resumeTextList("需要补齐或确认", data.gaps),
    resumeTextList("下一步行动", data.nextActions),
  ].filter(Boolean).forEach((section) => elements.mainResumeAnalysis.append(section));

  elements.mainResumePlaceholder.hidden = true;
  elements.mainResumeAnalysis.hidden = false;
  elements.resumeSearchToggle.hidden = false;
  elements.mainResumeState.textContent = "分析完成";
  elements.mainResumeState.classList.add("ready");
}

elements.mainAnalyzeResume.addEventListener("click", async () => {
  const file = elements.mainResumeFile.files[0];
  const resumeText = elements.mainResumeText.value.trim();
  if (!file && resumeText.length < 80) {
    showToast("请选择简历文件，或粘贴至少 80 个字的简历内容");
    elements.mainResumeAssistant.open = true;
    return;
  }
  if (file && file.size > 5 * 1024 * 1024) {
    showToast("简历文件请控制在 5 MB 以内");
    return;
  }
  if (!elements.mainPrivacyConsent.checked) {
    showToast("请先阅读隐私政策并勾选简历分析授权");
    elements.mainPrivacyConsent.focus();
    return;
  }

  elements.mainAnalyzeResume.disabled = true;
  elements.mainAnalyzeResume.querySelector("span").textContent = "正在分析经历与岗位方向…";
  elements.mainResumeState.textContent = "分析中";
  elements.mainResumeState.classList.remove("ready");

  try {
    const response = await apiFetch("/api/analyze-resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file?.name || "",
        mimeType: file?.type || "",
        fileBase64: file ? await resumeFileToBase64(file) : "",
        resumeText,
        preferredRoles: [getRole()].filter((role) => !role.includes("未填写")),
        targetCity: getValue(elements.locationSelect, elements.locationCustom, ""),
        identity: getValue(elements.identitySelect, elements.identityCustom, ""),
        englishLevel: "按具体岗位原文核验",
        model: elements.modelSelect.value,
        privacyConsent: true,
        privacyPolicyVersion,
        consentAt: new Date().toISOString(),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "简历分析失败");
    currentResumeAnalysis = data.analysis;
    renderMainResumeAnalysis(currentResumeAnalysis);
    renderQuota(elements.quotaStatus, data.quota, data.adminMode);
  } catch (error) {
    elements.mainResumeState.textContent = "分析失败";
    showToast(error.message);
  } finally {
    elements.mainAnalyzeResume.disabled = false;
    elements.mainAnalyzeResume.querySelector("span").textContent = "分析简历并推荐岗位";
  }
});

elements.mainRevokeConsent.addEventListener("click", async () => {
  elements.mainResumeFile.value = "";
  elements.mainResumeFileLabel.textContent = "未选择文件，也可以直接粘贴文字";
  elements.mainResumeText.value = "";
  elements.mainPrivacyConsent.checked = false;
  elements.mainResumeAnalysis.replaceChildren();
  elements.mainResumeAnalysis.hidden = true;
  elements.mainResumePlaceholder.hidden = false;
  elements.resumeSearchToggle.hidden = true;
  elements.mainResumeState.textContent = "未分析";
  elements.mainResumeState.classList.remove("ready");
  currentResumeAnalysis = null;
  try {
    await apiFetch("/api/privacy/revoke", { method: "POST" });
  } catch {
    // Clearing local resume content does not depend on server availability.
  }
  showToast("已撤回授权并清除本页简历内容");
});

function getValue(select, custom, fallback) {
  if (select.value === "custom") return custom.value.trim() || fallback;
  return select.value || fallback;
}

function getRole() {
  return elements.roleSelect.value === "custom"
    ? elements.roleCustom.value.trim() || "岗位偏好未填写"
    : elements.roleSelect.value;
}

function resumeSearchContext() {
  if (!currentResumeAnalysis || !elements.useResumeAnalysis.checked) return "";
  const roles = (currentResumeAnalysis.recommendedRoles || [])
    .map((item) => item.role)
    .filter(Boolean)
    .join("、");
  const strengths = (currentResumeAnalysis.strengths || []).join("、");
  const gaps = (currentResumeAnalysis.gaps || []).join("、");
  return `简历匹配辅助信息：
- 简历摘要：${currentResumeAnalysis.summary || "不知道"}
- 可证明优势：${strengths || "不知道"}
- AI 推荐方向：${roles || "不知道"}
- 需要补齐或确认：${gaps || "不知道"}
以上内容只用于辅助搜索与岗位匹配，不属于公司事实。用户最终岗位偏好仍以“${getRole()}”为准，不能因简历摘要降低招聘真实性、应届生适配或证据要求。`;
}

function buildPrompt() {
  const districts = selectedDistricts();
  const city = getValue(elements.locationSelect, elements.locationCustom, "工作地点未填写");
  const values = {
    年龄: getValue(elements.ageSelect, elements.ageCustom, "年龄未知"),
    身份: getValue(elements.identitySelect, elements.identityCustom, "身份未填写"),
    地点: city,
    实际区域: districts.length ? districts.join("、") : `${city}全市`,
    数量: getValue(elements.countSelect, elements.countCustom, "数量未填写").replace(/\s*家$/, ""),
    岗位偏好: getRole(),
  };

  let prompt = elements.template.value;
  for (const [key, value] of Object.entries(values)) {
    prompt = prompt.replaceAll(`{{${key}}}`, value);
  }
  if (supplyChainIsActive()) {
    prompt += `\n\n${supplyChainExpansionPrompt}`;
  }
  const resumeContext = resumeSearchContext();
  if (resumeContext) prompt += `\n\n${resumeContext}`;
  prompt += "\n\n来源链接要求：招聘来源优先覆盖企业官网、企业招聘官网、BOSS直聘、猎聘、鱼泡直聘、高校就业网和政府就业平台；表格中必须同时写出来源名称、完整 URL 和对应证据编号。已知链接时不得只写平台名称。";
  prompt += "\n\n求职者优先表头：序号、公司名称、等级、细分行业之后，依次优先展示招聘状态及日期、招聘人数、岗位、应届生依据、薪资、招聘来源；招聘人数没有明确证据时填写“不知道”，不得用公司规模代替。";
  if (selectedModes.size > 1) {
    prompt += `\n\n当前复选模式：${orderedModes().map((mode) => modeConfig[mode].label).join("、")}。按并集检索、分轨判定、公司去重，并增加“入选模式”字段。`;
  }
  prompt += `\n\n输出语言：${elements.languageSelect.value}。`;
  return {
    prompt,
    values,
    profile: {
      age: values.年龄,
      identity: values.身份,
      city,
      districts,
      rolePreference: values.岗位偏好,
      companyCount: Number(values.数量),
      language: elements.languageSelect.value,
      mode: activeMode,
      modes: orderedModes(),
      modeLabel: orderedModes().map((mode) => modeConfig[mode].label).join(" + "),
      expandSupplyChain: supplyChainIsActive(),
      resumeSummary: resumeContext,
    },
  };
}

function validate(values) {
  const missing = [];
  if (values.年龄.includes("未知")) missing.push("年龄");
  if (values.身份.includes("未填写")) missing.push("身份");
  if (values.地点.includes("未填写")) missing.push("工作地点");
  if (values.数量.includes("未填写")) missing.push("公司数量");
  if (values.岗位偏好.includes("未填写")) missing.push("岗位偏好");
  if (missing.length) {
    showToast(`请先填写：${missing.join("、")}`);
    return false;
  }
  const count = Number(values.数量);
  if (!Number.isInteger(count) || count < 1 || count > 50) {
    showToast("公司数量需为 1 到 50 的整数");
    return false;
  }
  return true;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/&lt;br\s*\/?&gt;/gi, "<br>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/(?<!href=")(https?:\/\/[^\s<>"）。，、]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\[S(\d+)\]/g, (match, number) => {
      const source = currentEvidenceSources.find((item) => item.id === `S${number}`);
      if (!source?.url) return match;
      return `<a class="source-ref" href="${escapeAttribute(source.url)}" target="_blank" rel="noopener noreferrer" title="${escapeAttribute(source.title || source.id)}">${match}</a>`;
    });
}

function renderMarkdown(markdown) {
  const lines = String(markdown).replace(/\r/g, "").split("\n");
  let html = "";
  let listTag = "";
  let tableRows = [];

  const flushList = () => {
    if (listTag) html += `</${listTag}>`;
    listTag = "";
  };

  const flushTable = () => {
    if (!tableRows.length) return;
    const rows = tableRows
      .filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell.trim())))
      .map((row) => row.map((cell) => inlineMarkdown(cell.trim())));
    if (rows.length) {
      html += `<table><thead><tr>${rows[0].map((cell) => `<th>${cell}</th>`).join("")}</tr></thead><tbody>`;
      html += rows.slice(1).map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("");
      html += "</tbody></table>";
    }
    tableRows = [];
  };

  for (const line of lines) {
    if (/^\|.*\|$/.test(line.trim())) {
      flushList();
      tableRows.push(line.trim().slice(1, -1).split("|"));
      continue;
    }
    flushTable();
    if (!line.trim()) {
      flushList();
      continue;
    }
    if (/^\s*---+\s*$/.test(line)) {
      flushList();
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushList();
      html += `<h${heading[1].length}>${inlineMarkdown(heading[2])}</h${heading[1].length}>`;
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (bullet || ordered) {
      const nextTag = bullet ? "ul" : "ol";
      if (listTag !== nextTag) {
        flushList();
        html += `<${nextTag}>`;
        listTag = nextTag;
      }
      html += `<li>${inlineMarkdown((bullet || ordered)[1])}</li>`;
      continue;
    }
    flushList();
    html += `<p>${inlineMarkdown(line)}</p>`;
  }
  flushList();
  flushTable();
  return html;
}

const resultColumnPriorities = [
  /^(?:序号|编号|no\.?)$/i,
  /^(?:公司名称|企业名称|公司|company)$/i,
  /^(?:等级|级别|grade)$/i,
  /^(?:细分行业|行业|所属行业|industry)$/i,
  /^(?:招聘状态及日期|招聘状态|是否招聘|在招状态|招聘日期|岗位状态及日期)$/,
  /^(?:招聘人数|招聘数量|需求人数|计划招聘人数|招聘名额)$/,
  /^(?:岗位|招聘岗位|职位|应届生岗位|position|role)$/i,
  /^(?:应届生依据|应届依据|应届生适配|学历与应届生依据|招聘对象)$/,
  /^(?:薪资|薪酬|工资|薪资范围|月薪)$/,
  /^(?:招聘来源|招聘信息来源|投递来源|申请链接)$/,
  /^(?:入选模式|适用模式|筛选模式)$/,
  /^(?:实际办公地点|工作地点|招聘地点|办公地点)$/,
  /^(?:区域扩展情况|地点扩展情况)$/,
  /^(?:规模及口径|公司规模|企业规模|规模)$/,
  /^(?:核心产品或业务|核心产品|核心业务|主营业务)$/,
  /^(?:企业性质|公司性质)$/,
  /^(?:成立时间|成立年份)$/,
  /^(?:注册地址|注册地)$/,
  /^(?:培养证据|培养体系证据|培训体系|培训证据)$/,
  /^(?:业务或经营证据|产品与经营证据|经营证据)$/,
  /^(?:融资或知识产权|融资情况|知识产权)$/,
  /^(?:劳动争议与经营风险|风险信息|经营风险|劳动争议)$/,
  /^(?:待确认事项|未知事项)$/,
  /^(?:证据门槛|验证结论|核验结论)$/,
];

function normalizedHeader(value) {
  return String(value).replace(/\s+/g, "").replace(/[：:]/g, "").trim();
}

function resultColumnRank(value, originalIndex) {
  const header = normalizedHeader(value);
  const rank = resultColumnPriorities.findIndex((pattern) => pattern.test(header));
  return rank < 0 ? resultColumnPriorities.length * 100 + originalIndex : rank;
}

function reorderResultTable(table) {
  const headerRow = table.tHead?.rows?.[0] || table.rows[0];
  if (!headerRow) return;
  const headers = [...headerRow.cells].map((cell, index) => ({
    index,
    text: cell.textContent,
    rank: resultColumnRank(cell.textContent, index),
  }));
  const order = headers
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((item) => item.index);
  if (order.every((value, index) => value === index)) return;

  [...table.rows].forEach((row) => {
    const cells = [...row.cells];
    order.forEach((index) => {
      if (cells[index]) row.append(cells[index]);
    });
  });
}

function reorderResultTables(container) {
  container.querySelectorAll("table").forEach(reorderResultTable);
}

function citationTitleMatches(value) {
  return /^(?:引用来源|参考来源|参考文献|来源列表|MLA\s*格式(?:引用)?来源|Works\s+Cited|Sources)\s*(?:[（(].*?[）)])?\s*[:：]?\s*$/i
    .test(String(value).replace(/\s+/g, " ").trim());
}

function collapseCitationSection(container) {
  const existing = container.querySelector(".citation-disclosure");
  if (existing) return;
  const candidates = [...container.children].filter((item) =>
    /^(?:H[1-6]|P|DIV)$/.test(item.tagName),
  );
  const heading = candidates.find((item) => citationTitleMatches(item.textContent));
  if (!heading) return;

  const details = document.createElement("details");
  details.className = "citation-disclosure";
  const summary = document.createElement("summary");
  const label = document.createElement("span");
  label.textContent = heading.textContent.trim();
  const arrow = document.createElement("i");
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "⌄";
  summary.append(label, arrow);

  const content = document.createElement("div");
  content.className = "citation-content";
  let node = heading.nextSibling;
  while (node) {
    const next = node.nextSibling;
    content.append(node);
    node = next;
  }
  heading.replaceWith(details);
  details.append(summary, content);
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function excelColumn(index) {
  let value = index + 1;
  let result = "";
  while (value) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function worksheetXml(rows) {
  const hyperlinks = [];
  const widths = [];
  const body = rows.map((row, rowIndex) => {
    const cells = row.map((cell, columnIndex) => {
      const ref = `${excelColumn(columnIndex)}${rowIndex + 1}`;
      const text = String(cell.text || "");
      widths[columnIndex] = Math.max(widths[columnIndex] || 10, Math.min(44, text.length * .85 + 4));
      if (cell.url) hyperlinks.push({ ref, url: cell.url });
      const style = rowIndex === 0 ? 1 : cell.url ? 3 : 2;
      return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");

  const columns = widths.map((width, index) =>
    `<col min="${index + 1}" max="${index + 1}" width="${width.toFixed(1)}" customWidth="1"/>`,
  ).join("");
  const hyperlinkXml = hyperlinks.length
    ? `<hyperlinks>${hyperlinks.map((link, index) => `<hyperlink ref="${link.ref}" r:id="rId${index + 1}"/>`).join("")}</hyperlinks>`
    : "";
  const rels = hyperlinks.length
    ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hyperlinks.map((link, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xmlEscape(link.url)}" TargetMode="External"/>`).join("")}</Relationships>`
    : "";

  return {
    xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${columns}</cols><sheetData>${body}</sheetData>${hyperlinkXml}</worksheet>`,
    rels,
  };
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function zipWorkbook(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const checksum = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.length + data.length;
  }

  const centralDirectory = concatBytes(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectory.length, true);
  endView.setUint32(16, offset, true);
  return concatBytes([...localParts, centralDirectory, end]);
}

function tableTitle(table, index) {
  let node = table.previousElementSibling;
  while (node) {
    if (/^H[1-6]$/.test(node.tagName)) return node.textContent.trim();
    node = node.previousElementSibling;
  }
  return `企业结果 ${index + 1}`;
}

function tableDataset(table, index) {
  const title = tableTitle(table, index);
  const rows = [...table.rows];
  const headers = rows[0]
    ? [...rows[0].cells].map((cell, columnIndex) => cell.innerText.trim() || `字段${columnIndex + 1}`)
    : [];
  const records = rows.slice(1).map((row) => {
    const record = {};
    [...row.cells].forEach((cell, columnIndex) => {
      const reference = cell.textContent.match(/\[S\d+\]/)?.[0]?.slice(1, -1);
      const source = currentEvidenceSources.find((item) => item.id === reference);
      const directLink = cell.querySelector("a[href^='http']");
      record[headers[columnIndex] || `字段${columnIndex + 1}`] = {
        text: cell.innerText.trim(),
        url: directLink?.href || source?.url || "",
      };
    });
    return record;
  });
  return { title, headers, records };
}

function exportSheets() {
  const tables = [...elements.resultContent.querySelectorAll("table")];
  const datasets = tables.map(tableDataset);
  const allHeaders = [...new Set(datasets.flatMap((dataset) => dataset.headers))];
  const combinedRows = [
    ["结果分类", ...allHeaders].map((text) => ({ text, url: "" })),
    ...datasets.flatMap((dataset) =>
      dataset.records.map((record) => [
        { text: dataset.title, url: "" },
        ...allHeaders.map((header) => record[header] || { text: "", url: "" }),
      ]),
    ),
  ];
  const sheets = [{ name: "全部企业", rows: combinedRows }];

  datasets.forEach((dataset) => {
    sheets.push({
      name: dataset.title,
      rows: [
        dataset.headers.map((text) => ({ text, url: "" })),
        ...dataset.records.map((record) =>
          dataset.headers.map((header) => record[header] || { text: "", url: "" }),
        ),
      ],
    });
  });

  sheets.push({
    name: "来源明细",
    rows: [
      ["证据编号", "来源标题", "原始链接", "发布日期"].map((text) => ({ text, url: "" })),
      ...currentEvidenceSources.map((source) => [
        { text: source.id, url: source.url },
        { text: source.title || "无标题", url: source.url },
        { text: source.url, url: source.url },
        { text: source.publishedAt || "不知道", url: "" },
      ]),
    ],
  });
  return sheets;
}

function safeSheetName(name, index, used) {
  const base = String(name || `结果${index + 1}`).replace(/[\\/?*:[\]]/g, " ").trim().slice(0, 31) || `结果${index + 1}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    const tail = ` ${suffix}`;
    candidate = `${base.slice(0, 31 - tail.length)}${tail}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function downloadWorkbook() {
  const sheets = exportSheets();
  if (sheets.length <= 2 || sheets[0].rows.length <= 1) {
    showToast("当前结果中没有可导出的企业表格");
    return;
  }
  const usedNames = new Set();
  sheets.forEach((sheet, index) => {
    sheet.name = safeSheetName(sheet.name, index, usedNames);
    Object.assign(sheet, worksheetXml(sheet.rows));
  });

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets></workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="10"/><name val="Microsoft YaHei"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Microsoft YaHei"/></font><font><u/><color rgb="FF0563C1"/><sz val="10"/><name val="Microsoft YaHei"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF106A65"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FFD9E0DC"/></left><right style="thin"><color rgb="FFD9E0DC"/></right><top style="thin"><color rgb="FFD9E0DC"/></top><bottom style="thin"><color rgb="FFD9E0DC"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

  const files = [
    { name: "[Content_Types].xml", content: contentTypes },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", content: workbook },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRels },
    { name: "xl/styles.xml", content: styles },
  ];
  sheets.forEach((sheet, index) => {
    files.push({ name: `xl/worksheets/sheet${index + 1}.xml`, content: sheet.xml });
    if (sheet.rels) files.push({ name: `xl/worksheets/_rels/sheet${index + 1}.xml.rels`, content: sheet.rels });
  });

  const bytes = zipWorkbook(files);
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const link = document.createElement("a");
  const city = currentExportProfile?.city?.replace(/[\\/:*?"<>|]/g, "") || "求职";
  link.href = URL.createObjectURL(blob);
  link.download = `${city}企业核验结果-${new Date().toISOString().slice(0, 10)}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  showToast(`Excel 已导出全部 ${sheets[0].rows.length - 1} 条企业记录`);
}

function renderEvidenceSummary(search, billing) {
  if (!search) {
    elements.evidenceSummary.hidden = true;
    return;
  }
  const queries = Array.isArray(search.queries) ? search.queries.length : 0;
  const sources = Number(search.sourceCount || 0);
  const directlyVerified = Number(search.directlyVerifiedCount || 0);
  const providerVerified = Number(search.providerVerifiedCount || 0);
  const ambiguities = Array.isArray(search.ambiguities) && search.ambiguities.length
    ? `；需求校准提示：${search.ambiguities.map(escapeHtml).join("、")}`
    : "";
  const consistency = search.cached
    ? `；已复用 ${Number(search.consistencyWindowMinutes || 15)} 分钟一致性窗口内的审计结果`
    : "；本次结果已完成二次分级审计";
  const ruleVersion = search.classificationVersion
    ? `；分级规则 v${escapeHtml(search.classificationVersion)}`
    : "";
  elements.evidenceSummary.innerHTML =
    `<strong>本次证据链：</strong>${queries} 组检索词，取得 ${sources} 个去重网页来源，` +
    `其中 ${directlyVerified} 个由服务端直接读取正文，${providerVerified} 个由 Tavily 抽取正文；` +
    `检索服务 ${escapeHtml(search.provider || "未知")}，` +
    `访问日期 ${escapeHtml(search.accessedAt || "不知道")}${ruleVersion}${consistency}${ambiguities}。`;
  if (billing) {
    const costLine = document.createElement("p");
    const deepseek = billing.deepseek || {};
    const tavily = billing.tavily || {};
    costLine.innerHTML = `<strong>本次用量：</strong>DeepSeek 输入 ${Number(deepseek.promptTokens || 0).toLocaleString()} tokens，` +
      `输出 ${Number(deepseek.completionTokens || 0).toLocaleString()} tokens，预估 ¥${Number(deepseek.estimatedCostCny || 0).toFixed(4)}，` +
      `平均 ¥${Number(deepseek.averageCnyPerToken || 0).toFixed(8)} / token；` +
      `Tavily ${Number(tavily.requests || 0)} 次 / ${Number(tavily.credits || 0)} credits，` +
      `合计预估 ¥${Number(billing.estimatedTotalCny || 0).toFixed(4)}${billing.cached ? "（缓存命中，本次未新增消耗）" : ""}。`;
    elements.evidenceSummary.append(costLine);
  }
  const sourceList = Array.isArray(search.sources) ? search.sources : [];
  if (sourceList.length) {
    const details = document.createElement("details");
    details.className = "evidence-links";
    const summary = document.createElement("summary");
    summary.innerHTML = `<span>查看 ${sourceList.length} 个来源链接</span><i aria-hidden="true">⌄</i>`;
    const list = document.createElement("ol");
    sourceList.forEach((source) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = `${source.id} · ${source.title || source.url}`;
      const state = document.createElement("small");
      state.className = `evidence-state ${["body_verified", "provider_verified"].includes(source.verificationStatus) ? "verified" : ""}`;
      state.textContent = source.verificationStatus === "body_verified"
        ? "服务端已读取正文"
        : source.verificationStatus === "provider_verified"
          ? "Tavily 已抽取正文"
          : "仅搜索摘要";
      item.append(link, state);
      list.append(item);
    });
    details.append(summary, list);
    elements.evidenceSummary.append(details);
  }
  elements.evidenceSummary.hidden = false;
}

async function checkHealth() {
  try {
    const response = await apiFetch("/api/health");
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error();
    const ready = data.apiConfigured && data.searchConfigured;
    elements.apiStatus.classList.toggle("ready", ready);
    elements.apiStatus.classList.toggle("error", !ready);
    elements.railApiStatus.classList.toggle("ready", ready);
    elements.railApiStatus.classList.toggle("error", !ready);
    if (!data.apiConfigured) {
      elements.apiStatus.querySelector("span").textContent = "DeepSeek 密钥未配置";
      elements.railApiStatus.title = "DeepSeek 密钥未配置";
    } else if (!data.searchConfigured) {
      elements.apiStatus.querySelector("span").textContent = "联网检索尚未配置";
      elements.railApiStatus.title = "联网检索尚未配置";
      elements.searchHint.textContent = "请在服务端配置搜索 API；未配置时系统会拒绝生成事实名单。";
    } else {
      elements.apiStatus.querySelector("span").textContent = `DeepSeek + ${data.searchProvider} 已连接`;
      elements.railApiStatus.title = `DeepSeek + ${data.searchProvider} 已连接`;
      elements.searchHint.textContent = `强制使用 ${data.searchProvider} 联网检索；无证据不生成公司名单。`;
    }
    refreshQuota(elements.quotaStatus);
  } catch {
    elements.apiStatus.classList.add("error");
    elements.apiStatus.querySelector("span").textContent = "服务连接失败";
    elements.railApiStatus.classList.add("error");
    elements.railApiStatus.title = "服务连接失败";
  }
}

elements.generate.addEventListener("click", async () => {
  const { prompt, values, profile } = buildPrompt();
  if (!validate(values)) return;

  localStorage.setItem(templateStorageKey(), elements.template.value);
  elements.generate.disabled = true;
  elements.generate.querySelector("span").textContent = "正在检索、分级并进行二次审计…";

  try {
    const response = await apiFetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        profile,
        model: elements.modelSelect.value,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "生成失败");

    renderQuota(elements.quotaStatus, data.quota, data.adminMode);
    currentEvidenceSources = Array.isArray(data.search?.sources) ? data.search.sources : [];
    currentExportProfile = profile;
    elements.resultContent.innerHTML = renderMarkdown(data.content);
    reorderResultTables(elements.resultContent);
    collapseCitationSection(elements.resultContent);
    elements.modelBadge.textContent = data.model || elements.modelSelect.value;
    renderEvidenceSummary(data.search, data.billing);
    elements.downloadExcel.disabled = elements.resultContent.querySelectorAll("table").length === 0;
    elements.resultCard.hidden = false;
    elements.resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    currentEvidenceSources = [];
    currentExportProfile = null;
    elements.downloadExcel.disabled = true;
    elements.resultCard.hidden = false;
    elements.evidenceSummary.hidden = true;
    elements.resultContent.innerHTML = `<p><strong>生成失败：</strong>${escapeHtml(error.message)}</p>`;
    elements.resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
  } finally {
    elements.generate.disabled = false;
    elements.generate.querySelector("span").textContent = "联网核验并生成结果";
  }
});

document.querySelector("#resetTemplate").addEventListener("click", () => {
  elements.template.value = defaultTemplateForModes();
  localStorage.removeItem(templateStorageKey());
  updateTemplateState();
  showToast("已恢复当前组合模式预设");
});

const EXAMPLE_STORAGE_KEY = "jobCompassExamples:v1";
const EXAMPLE_LIMIT = 20;
const builtInExample = {
  name: "天津西青区 · 本科应届生",
  mode: "balanced",
  modes: ["balanced"],
  fields: {
    ageSelect: "22 岁",
    ageCustom: "",
    identitySelect: "应届本科毕业生",
    identityCustom: "",
    locationSelect: "天津市",
    locationCustom: "",
    countSelect: "10",
    countCustom: "",
    roleSelect: "职能岗位（排除销售与研发）",
    roleCustom: "",
    language: "简体中文",
    model: "deepseek-v4-flash",
  },
  districts: ["西青区"],
  customDistricts: [],
};

function getExamples() {
  try {
    const stored = JSON.parse(localStorage.getItem(EXAMPLE_STORAGE_KEY) || "[]");
    return Array.isArray(stored) ? stored.slice(0, EXAMPLE_LIMIT) : [];
  } catch {
    return [];
  }
}

function storeExamples(examples) {
  localStorage.setItem(EXAMPLE_STORAGE_KEY, JSON.stringify(examples.slice(0, EXAMPLE_LIMIT)));
}

function restoreSelectField(select, input, value, customValue = "") {
  const hasOption = [...select.options].some((option) => option.value === value);
  select.value = hasOption ? value : "";
  input.value = customValue;
  select.closest(".field-token").classList.toggle("custom", select.value === "custom");
}

function applyExample(example, announce = true) {
  const fields = example.fields || {};
  const exampleModes = Array.isArray(example.modes)
    ? example.modes.filter((mode) => modeConfig[mode])
    : [modeConfig[example.mode] ? example.mode : activeMode];
  activeMode = exampleModes.at(-1) || "balanced";
  renderModeSelection(new Set(exampleModes), { announce: false });
  supplyChainEnabled = Boolean(example.expandSupplyChain);
  localStorage.setItem("jobCompassSupplyChain", String(supplyChainEnabled));
  renderSupplyChainControl();
  restoreSelectField(elements.ageSelect, elements.ageCustom, fields.ageSelect, fields.ageCustom);
  restoreSelectField(elements.identitySelect, elements.identityCustom, fields.identitySelect, fields.identityCustom);
  restoreSelectField(elements.locationSelect, elements.locationCustom, fields.locationSelect, fields.locationCustom);
  restoreSelectField(elements.countSelect, elements.countCustom, fields.countSelect, fields.countCustom);

  const roleExists = [...elements.roleSelect.options].some((option) => option.value === fields.roleSelect);
  elements.roleSelect.value = roleExists ? fields.roleSelect : "职能岗位（排除销售与研发）";
  elements.roleCustom.value = fields.roleCustom || "";
  elements.roleSelect.closest(".role-option").classList.toggle("custom", elements.roleSelect.value === "custom");

  if ([...elements.languageSelect.options].some((option) => option.value === fields.language)) {
    elements.languageSelect.value = fields.language;
  }
  if ([...elements.modelSelect.options].some((option) => option.value === fields.model)) {
    elements.modelSelect.value = fields.model;
  }

  customDistricts.clear();
  for (const district of example.customDistricts || []) customDistricts.add(district);
  renderDistricts(example.districts || []);
  closeExampleMenu();
  if (announce) showToast(`已载入：${example.name || "本地示例"}`);
}

function buildExampleName() {
  const city = getValue(elements.locationSelect, elements.locationCustom, "未设置地点");
  const districts = selectedDistricts();
  const identity = getValue(elements.identitySelect, elements.identityCustom, "身份未设置");
  const area = districts.length ? `${city}${districts.slice(0, 2).join("、")}` : city;
  return `${area} · ${identity}`;
}

function captureCurrentExample() {
  return {
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: buildExampleName(),
    savedAt: new Date().toISOString(),
    mode: activeMode,
    modes: orderedModes(),
    expandSupplyChain: supplyChainIsActive(),
    fields: {
      ageSelect: elements.ageSelect.value,
      ageCustom: elements.ageCustom.value.trim(),
      identitySelect: elements.identitySelect.value,
      identityCustom: elements.identityCustom.value.trim(),
      locationSelect: elements.locationSelect.value,
      locationCustom: elements.locationCustom.value.trim(),
      countSelect: elements.countSelect.value,
      countCustom: elements.countCustom.value.trim(),
      roleSelect: elements.roleSelect.value,
      roleCustom: elements.roleCustom.value.trim(),
      language: elements.languageSelect.value,
      model: elements.modelSelect.value,
    },
    districts: selectedDistricts(),
    customDistricts: [...customDistricts],
  };
}

function formatExampleMeta(example) {
  const role = example.fields?.roleSelect === "custom"
    ? example.fields.roleCustom || "自定义岗位"
    : example.fields?.roleSelect || "岗位未设置";
  const date = example.savedAt
    ? new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(example.savedAt))
    : "";
  const modes = Array.isArray(example.modes) && example.modes.length
    ? example.modes
    : [example.mode];
  const modeLabel = modes.map((mode) => modeConfig[mode]?.label).filter(Boolean).join("+");
  return [modeLabel, role, date].filter(Boolean).join(" · ");
}

function renderExamples() {
  const examples = getExamples();
  elements.exampleList.replaceChildren();
  elements.exampleEmpty.hidden = examples.length > 0;
  elements.exampleCount.textContent = `${examples.length} 个`;
  elements.clearExamples.disabled = examples.length === 0;

  examples.forEach((example, index) => {
    const row = document.createElement("div");
    row.className = "example-item";

    const load = document.createElement("button");
    load.type = "button";
    load.className = "example-item-main";
    load.setAttribute("aria-label", `载入示例：${example.name}`);

    const mark = document.createElement("span");
    mark.className = "example-item-mark";
    mark.textContent = String(index + 1).padStart(2, "0");

    const copy = document.createElement("span");
    copy.className = "example-item-copy";
    const title = document.createElement("strong");
    title.textContent = example.name || "未命名示例";
    const meta = document.createElement("span");
    meta.textContent = formatExampleMeta(example);
    copy.append(title, meta);
    load.append(mark, copy);
    load.addEventListener("click", () => applyExample(example));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "example-delete";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `删除示例：${example.name}`);
    remove.addEventListener("click", () => {
      storeExamples(getExamples().filter((item) => item.id !== example.id));
      renderExamples();
      showToast("已删除本地示例");
    });

    row.append(load, remove);
    elements.exampleList.append(row);
  });
}

function openExampleMenu() {
  elements.exampleDropdown.hidden = false;
  elements.exampleToggle.setAttribute("aria-expanded", "true");
  renderExamples();
}

function closeExampleMenu() {
  elements.exampleDropdown.hidden = true;
  elements.exampleToggle.setAttribute("aria-expanded", "false");
}

elements.exampleToggle.addEventListener("click", () => {
  if (elements.exampleDropdown.hidden) openExampleMenu();
  else closeExampleMenu();
});

document.querySelector("#loadExample").addEventListener("click", () => {
  applyExample(getExamples()[0] || builtInExample);
});

document.querySelector("#loadBuiltInExample").addEventListener("click", () => {
  applyExample(builtInExample);
});

document.querySelector("#saveExample").addEventListener("click", () => {
  const example = captureCurrentExample();
  storeExamples([example, ...getExamples()]);
  renderExamples();
  showToast(`已保存：${example.name}`);
});

elements.clearExamples.addEventListener("click", () => {
  if (!getExamples().length) return;
  if (!window.confirm("确定清空当前浏览器中保存的全部示例吗？")) return;
  localStorage.removeItem(EXAMPLE_STORAGE_KEY);
  renderExamples();
  showToast("已清空本地示例");
});

document.addEventListener("click", (event) => {
  if (!elements.exampleMenu.contains(event.target)) closeExampleMenu();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeExampleMenu();
});

document.querySelector("#clearAll").addEventListener("click", () => {
  for (const select of [elements.ageSelect, elements.identitySelect, elements.locationSelect, elements.countSelect]) {
    select.value = "";
    select.closest(".field-token").classList.remove("custom");
  }
  for (const input of [elements.ageCustom, elements.identityCustom, elements.locationCustom, elements.countCustom, elements.roleCustom, elements.districtCustom]) {
    input.value = "";
  }
  elements.roleSelect.value = "职能岗位（排除销售与研发）";
  elements.roleSelect.closest(".role-option").classList.remove("custom");
  customDistricts.clear();
  renderDistricts();
  elements.resultCard.hidden = true;
  elements.downloadExcel.disabled = true;
  currentEvidenceSources = [];
  currentExportProfile = null;
  currentResumeAnalysis = null;
  elements.mainResumeFile.value = "";
  elements.mainResumeFileLabel.textContent = "未选择文件，也可以直接粘贴文字";
  elements.mainResumeText.value = "";
  elements.mainResumePlaceholder.hidden = false;
  elements.mainResumeAnalysis.hidden = true;
  elements.mainResumeAnalysis.replaceChildren();
  elements.resumeSearchToggle.hidden = true;
  elements.useResumeAnalysis.checked = true;
  elements.mainResumeState.textContent = "未分析";
  elements.mainResumeState.classList.remove("ready");
  showToast("已清空求职画像");
});

elements.downloadExcel.addEventListener("click", downloadWorkbook);

document.querySelector("#copyResult").addEventListener("click", async () => {
  await navigator.clipboard.writeText(elements.resultContent.innerText);
  showToast("结果已复制");
});

function desktopLayout() {
  return window.matchMedia("(min-width: 981px)").matches;
}

function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  const isCollapsed = collapsed && desktopLayout();
  document.body.classList.toggle("sidebar-collapsed", isCollapsed);
  if (desktopLayout()) elements.templatePanel.classList.remove("open");
  elements.openTemplate.textContent = desktopLayout() ? "模板" : "模板";
  elements.openTemplate.setAttribute("aria-expanded", String(!isCollapsed));
  elements.collapseTemplate.setAttribute("aria-expanded", String(!isCollapsed));
  elements.railExpandTemplate.setAttribute("aria-expanded", String(!isCollapsed));
  elements.templatePanel.setAttribute("aria-label", isCollapsed ? "职路快捷导航" : "筛选模板侧边栏");
  if (persist && desktopLayout()) {
    localStorage.setItem("jobCompassSidebarCollapsed", String(isCollapsed));
  }
}

elements.openTemplate.addEventListener("click", () => {
  if (desktopLayout()) setSidebarCollapsed(false);
  else elements.templatePanel.classList.add("open");
});

elements.railExpandTemplate.addEventListener("click", () => setSidebarCollapsed(false));

elements.collapseTemplate.addEventListener("click", () => {
  if (desktopLayout()) setSidebarCollapsed(true);
  else elements.templatePanel.classList.remove("open");
});

elements.adminModeButton?.addEventListener("click", handleAdminModeClick);
elements.floatingAdminMode?.addEventListener("click", handleAdminModeClick);
elements.railAdminMode?.addEventListener("click", handleAdminModeClick);
elements.adminCancel?.addEventListener("click", () => elements.adminDialog?.close());
elements.adminLoginButton?.addEventListener("click", submitAdminPassword);
elements.adminStatsRefresh?.addEventListener("click", refreshAdminStats);
elements.adminPassword?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    submitAdminPassword();
  }
});

window.addEventListener("resize", () => {
  const saved = localStorage.getItem("jobCompassSidebarCollapsed") === "true";
  setSidebarCollapsed(saved, { persist: false });
});

renderModeSelection(selectedModes, { saveCurrent: false });
setSidebarCollapsed(localStorage.getItem("jobCompassSidebarCollapsed") === "true", { persist: false });
checkHealth();
refreshAdminMode();
