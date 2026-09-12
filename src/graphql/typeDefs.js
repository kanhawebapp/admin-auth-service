// src/graphql/typeDefs.js

import { gql } from "graphql-tag";

const typeDefs = gql`
  scalar JSON
  scalar Upload
  enum Gender {
    MALE
    FEMALE
    OTHER
  }

  enum AdminRole {
    SUPER_ADMIN
    SUB_ADMIN
    MANAGER
    SUPPORT
  }

  type MessageResponse {
    success: Boolean!
    message: String!
  }

  enum ApprovalStatus {
    PENDING
    INTERVIEW
    DOCUMENT_VERIFICATION
    APPROVED
    REJECTED
  }
  enum CouponType {
    CASHBACK
    DISCOUNT
  }

  enum CouponVisibility {
    VISIBLE
    HIDDEN
  }

  enum InterviewStatus {
    SCHEDULED
    PASSED
    FAILED
    RESCHEDULED
  }

  enum DocumentType {
    AADHAAR
    PAN
    PASSBOOK
    PROFILE
  }

  enum SortOrder {
    ASC
    DESC
  }

  enum AstrologerSortField {
    EXPERIENCE
    PRICE
    RATING
  }

  input AstrologerSearchInput {
    query: String # search by name, skills, languages, etc.
    sortField: AstrologerSortField
    sortOrder: SortOrder
    limit: Int
    page: Int
  }
  type ServiceAstrologer {
    id: ID!
    price: Float!

    astrologer: Astrologer!
  }

  type AstrologerList {
    data: [Astrologer!]!
    totalCount: Int!
    currentPage: Int!
    totalPages: Int!
  }
  scalar DateTime
  type User {
    id: ID!
    name: String
    mobile: String
    gender: Gender
    source: String
    birthDate: String
    birthTime: DateTime
    occupation: String
    countryCode: String
    isActive: Boolean
    isDeleted: Boolean

    createdAt: DateTime
    updatedAt: DateTime

    userCoins: Float
    lockedCoins: Float

    wallet: UserWallet

    stats: UserStats
  }

  type UserStats {
    totalRecharge: Float
    walletBalance: Float
    totalRechargeCount: Int

    totalCalls: Int

    totalChats: Int

    totalReviews: Int

    totalFollowing: Int

    totalBookings: Int

    lastRechargeAmount: Float

    lastRechargeDate: String
  }

  #--------------------------------------#
  input PricingInput {
    type: PricingType!
    price: Float
    offerPrice: Float
    commissionPercent: Float
    isActive: Boolean!
  }

  input AddAstrologerInput {
    astroname: String!
    displayName: String!
    gender: Gender!
    applicationId: String
    dateOfBirth: String

    email: String!
    phoneNumber: String!
    experience: Int!
    status: Boolean

    profilePic: String
    expertise: [String!]!
    languages: [String!]!
    problems: [String!]!

    about: String

    tags: String
    vtags: String

    address: AddressInput

    bankDetails: BankDetailsInput
    documents: DocumentsInput

    pricing: [PricingInput!]!
  }

  type Astrologer {
    id: ID!
    name: String!
    displayName: String!
    profilePic: String
    gender: Gender!

    email: String!
    contactNo: String!
    experience: Int!

    about: String

    languages: [String!]!
    skills: [String!]!
    problems: [String!]!

    pricing: [AstrologerPricing!]!

    tags: String
    vtags: String

    approvalStatus: ApprovalStatus!

    addresses: [Address!]!
    experiences: [ExperiencePlatform!]!
    interviews: [Interview!]!

    isCallActive: Boolean!
    isChatActive: Boolean!
    isLiveActive: Boolean!
    isBusy: Boolean!
    isOnline: Boolean!
    isPromotional: Boolean!
isEligibleChat: Boolean!
isEligibleCall: Boolean!
isEligibleVideo: Boolean!
isEligibleAudio: Boolean!
isDeleted: Boolean!
    createdAt: DateTime
    updatedAt: DateTime
  }

  type Address {
    street: String!
    city: String!
    state: String!
    country: String!
    pincode: String!
  }

  type ExperiencePlatform {
    platformName: String!
    yearsWorked: Int!
  }

  type Interview {
    id: ID!
    roundNumber: Int
    interviewerName: String
    scheduledAt: String
    status: InterviewStatus
    remarks: String
  }

  type AstrologerRejectionHistory {
    id: ID!
    stage: String
    reason: String
    rejectedBy: String
    createdAt: DateTime
  }

  type Admin {
    id: ID!
    name: String!
    email: String!
    phoneNo: String!
    role: Role!
  }


  type AdminAuthPayload {
    admin: Admin!
    accessToken: String!
    refreshToken: String!
  }

  type AuthPayload {
    user: Staff!
    accessToken: String!
    refreshToken: String!
  }

  type PaginatedAstrologers {
    data: [Astrologer!]!
    totalCount: Int!
    currentPage: Int!
    totalPages: Int!
  }

  input UserSearchInput {
    query: String
    mobile: String
    filterType: String # TODAY | WEEK | MONTH | YEAR | CUSTOM
    startDate: String
    endDate: String
    page: Int
    limit: Int
      minBalance: Float
  maxBalance: Float
  }

  type UserList {
    data: [User!]!
    totalCount: Int!
    currentPage: Int!
    totalPages: Int!
  }

  type PaginatedInterviews {
    data: [Interview!]!
    totalCount: Int!
    currentPage: Int!
    totalPages: Int!
  }

  input AddressInput {
    street: String!
    city: String!
    state: String!
    country: String!
    pincode: String!
  }

  input ExperiencePlatformInput {
    platformName: String!
    yearsWorked: Int!
  }

  input RegisterAstrologerInput {
    profilePic: String!
    name: String!
    dateOfBirth: String!
    gender: Gender!
    languages: [String!]!
    skills: [String!]!
    experience: Int!
    email: String!
    contactNo: String!
    about: String!
    addresses: [AddressInput!]!
    experiences: [ExperiencePlatformInput!]!
  }
  type AdminPagination {
    data: [Admin!]!
    totalCount: Int!
    currentPage: Int!
    totalPages: Int!
  }
  #-----------------------------START OF RECHARGE PACKS-------------#
  input RechargePackInput {
    name: String!
    description: String
    price: Float!
    talktime: Int!
    coins: Int!
    validityDays: Int!
    isActive: Boolean
     hideAfterFirstRecharge: Boolean
  }

  type RechargePack {
    id: ID!
    name: String!
    description: String
    price: Float!
    talktime: Int!
    coins: Int!
    validityDays: Int!
    isActive: Boolean!
    createdAt: DateTime
    updatedAt: DateTime
    hideAfterFirstRecharge: Boolean!
  }

  input UpdateRechargePackInput {
    name: String
    description: String
    price: Float
    coins: Int
    talktime: Int
    validityDays: Int
    isActive: Boolean
      hideAfterFirstRecharge: Boolean
  }

  #-----------END OF RECHARGE PACKS-----------------#

  #------------Coupon ____------------------------_#
  input CreateCouponInput {
    code: String!
    description: String
    applicable: String

    type: String!
    visibility: String!
    status: String!

    couponCount: Int
    minOrderAmount: Float

    percentage: Float
    maxDiscount: Float
    redeemLimit: Int

    startDate: String!
    endDate: String!
  }

  type Coupon {
    id: ID!
    code: String!
    description: String

    applicable: String

    type: String!
    visibility: String!

    couponCount: Int
    status: Boolean

    percentage: Float
    maxDiscount: Float
    redeemLimit: Int
    minOrderAmount: Float

    startDate: String
    endDate: String

    createdAt: DateTime
    updatedAt: DateTime
  }
  input UpdateCouponInput {
    code: String
    description: String

    applicable: String

    type: String
    status: String
    visibility: String

    couponCount: Int
    minOrderAmount: Float

    percentage: Float
    maxDiscount: Float
    redeemLimit: Int

    startDate: String
    endDate: String
  }

  #-----------------------------START Wallet MANAGEMENT-----------------#
  type Wallet {
    id: ID!
    name: String!
    description: String
    coins: Int!
    price: Float!
    isActive: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type UserWallet {
    id: ID!
    userId: ID!

    balanceCoins: Float!
    lockedCoins: Float!

    createdAt: DateTime!
    updatedAt: DateTime!
  }

  #------ module -------#
  type Module {
    id: ID!
    name: String!
    slug: String!
    description: String
    section: String!
    isActive: Boolean
    createdAt: DateTime
    updatedAt: DateTime
  }

  type ModulePagination {
    data: [Module!]!
    totalCount: Int!
    currentPage: Int!
    totalPages: Int!
  }

  #*************************Role  ***********************#
  type Role {
    id: ID!
    name: String!
    slug: String!
    description: String
    isActive: Boolean
    permissions: [Permission!]
    createdAt: DateTime
    updatedAt: DateTime
  }
  type RolePagination {
    data: [Role!]!
    totalCount: Int!
    currentPage: Int!
    totalPages: Int!
  }

  #--------------Permission----------------#
  type Permission {
    id: ID!
    name: String!
    type: String!
    description: String
    modules: [Module!]
    createdAt: DateTime
    updatedAt: DateTime
  }

  type PermissionPagination {
    data: [Permission!]!
    totalCount: Int!
    currentPage: Int!
    totalPages: Int!
  }
  enum TransactionType {
    CREDIT
    DEBIT
  }
  type WalletResponse {
    success: Boolean!
    message: String!
    walletBalance: Float!
  }
  #------------------------------Department ____________#
  type Department {
    id: ID!
    name: String!
    slug: String!
    description: String
    isActive: Boolean
    createdAt: DateTime
    updatedAt: DateTime
  }

  type DepartmentPagination {
    data: [Department!]!
    totalCount: Int!
    currentPage: Int!
    totalPages: Int!
  }

  #------------------------------Staff ____________#
  type Staff {
    id: ID!
    name: String!
    email: String!
    department: Department
    role: Role
    permissions: [Permission!]
    isActive: Boolean
  }
  type StaffPagination {
    data: [Staff!]!
    totalCount: Int!
    currentPage: Int!
    totalPages: Int!
  }

  #-----------------moduleaccess ---#
  type ModuleAccess {
    id: ID!
    name: String!
    slug: String!
    permissions: [String!]!
  }

  type DeleteResponse {
    success: Boolean!
    message: String!
    error: String
  }

  type AddAstrologerResponse {
    success: Boolean!
    message: String!
    data: Astrologer
  }

  # --- dhwani services ___ #
  type Category {
    id: ID!
    name: String!
    slug: String!
    image: String

    services: [Service!]
  }

  type Service {
    id: ID!

    name: String!
    slug: String!
    astrologerMappings: [ServiceAstrologer!]
    image: String
    description: String
    longText: String
    price: Float

    category: Category
  }
  input CreateCategoryInput {
    name: String!
    slug: String!
    image: String
  }

  input CreateServiceInput {
    name: String!
    slug: String!
    image: String
    description: String
    longText: String
    price: Float
    categoryId: ID
  }
  input ServiceAstrologerInput {
    astrologerId: ID!
    price: Float!
  }
  input CreateCategoryInput {
    name: String!
  }

  #----gifts -------#
  type Gift {
    id: ID!
    name: String!
    amount: Float!
    image: String
    status: String!
    createdAt: DateTime
  }

  input GiftInput {
    name: String!
    amount: Float!
    image: String
    status: String!
  }

  #------ Testimonial-------#
  type Testimonial {
    id: ID!
    name: String!
    address: String
    content: String!
    image: String
    rating: Int!
    createdAt: String
    updatedAt: String
  }

  input CreateTestimonialInput {
    name: String!
    address: String
    content: String!
    image: String
    rating: Int!
  }

  input UpdateTestimonialInput {
    name: String
    address: String
    content: String
    image: String
    rating: Int
  }

  #------ FAQ ------#
  type Faq {
    id: ID!
    question: String!
    answer: String!
    createdAt: String
    updatedAt: String
  }

  input CreateFaqInput {
    question: String!
    answer: String!
  }

  input UpdateFaqInput {
    question: String
    answer: String
  }

  #---------------- baneers --------#
  type Banner {
    id: ID!
    heading: String!
    subheading: String
    slug: String!
    sortorder: Int
    bannerlink: String
    language: String
    imageUrl: String
    status: Boolean
    createdAt: String
    updatedAt: String
      bannerType: BannerType
  }

  input CreateBannerInput {
    heading: String!
    subheading: String
    slug: String!
    sortorder: Int
    bannerlink: String
    language: String
    imageUrl: String
      bannerType: BannerType
  }
enum BannerType {
  DESKTOP
  MOBILE
}
  input UpdateBannerInput {
    heading: String
    subheading: String
    slug: String
    sortorder: Int
    bannerlink: String
    language: String
    imageUrl: String
    status: Boolean
      bannerType: BannerType
  }

  #-------------------- pricing --------------#
  enum PricingType {
    CHAT
    CALL
    VIDEO
    AUDIO
    GIFT_COMMISSION
    OFFER
  }
  type AstrologerPricing {
    id: ID!
    type: PricingType!
    price: Float!
    offerPrice: Float
    commissionPercent: Float
    isActive: Boolean!
  }

  #-------------------------astrologer hirirng-------------------#
  enum InterviewStatus {
    PENDING
    SCHEDULED
    PASSED
    REJECTED
  }

  enum DocumentStatus {
    PENDING
    VERIFIED
    REJECTED
  }

  enum ApprovalStatus {
    PENDING
    APPROVED
    REJECTED
  }
  type AstrologerApplication {
    id: ID!
    name: String
    phoneNumber: String
    email: String
    gender: String
    skills: [String]
    languages: [String]
    problems: [String]
    dob: DateTime
    experience: Int
    applicationStatus: String!
    interviewStatus: String
    interviewRemarks: String

    documentStatus: DocumentStatus
    approvalStatus: ApprovalStatus
    astrologerId: String
    about: String
    address: String
    pincode: String

    interviewerId: String
    interviewDate: String
    interviewTime: String
    round: Int
    kycDetail: KycDetail

    createdAt: String
  }

  # pricing config #
  enum OfferType {
    FREE
    ONE_RUPEE
    ORIGINAL
  }

  type PricingConfig {
    id: ID!
    isGlobalOfferEnabled: Boolean
    globalChatPrice: Int
    globalCallPrice: Int

    isFirstOfferEnabled: Boolean
    firstChatPrice: Int
    firstCallPrice: Int

    isSecondOfferEnabled: Boolean
    secondChatPrice: Int
    secondCallPrice: Int
  }

  type UserOfferUsage {
    userId: String!
    hasUsedFirstOffer: Boolean!
  }

  type FinalPrice {
    chatPrice: Int
    callPrice: Int
    isOfferApplied: Boolean
  }

  type OfferAnalytics {
    totalUsers: Int
    firstUsed: Int
    secondUsed: Int
  }

  type UploadResponse {
    url: String
    filename: String
  }

  #--- docs & bank details -----#
  type KycDetail {
    id: ID!

    accountHolderName: String
    accountNumber: String
    bankName: String
    ifsc: String
    branchName: String
    panNumber: String
    documentRemarks: String

    aadhaarImage: String
    panImage: String
    passbookImage: String

    status: DocumentStatus
  }
  input KycDetailInput {
    accountHolderName: String
    accountNumber: String
    bankName: String
    ifsc: String
    branchName: String
    panNumber: String
    documentRemarks: String

    aadhaarImage: String
    panImage: String
    passbookImage: String

    status: DocumentStatus
  }

  input BankDetailsInput {
    accountHolderName: String
    accountNumber: String
    bankName: String
    ifscCode: String
    panCardNumber: String
    branchName: String
    status: DocumentStatus
  }
  input DocumentsInput {
    profilePic: String
    aadhaar: String
    panCard: String
    passbook: String
  }

  type UserWallet {
    id: ID!
    userId: ID!
    coins: Int!

    user: User

    createdAt: DateTime!
    updatedAt: DateTime!
  }
  type WalletTransactionList {
    data: [WalletTransaction!]!
    totalCount: Int!
  }
  #-----------------------------END Wallet MANAGEMENT-----------------#
  #-----------------------START for astrologer walet-----------------#
type AstrologerWallet {
  id: ID!
  astrologerId: ID!

  balanceCoins: Float
  lockedCoins: Int

  totalEarned: Int
  totalWithdrawn: Int

  astrologer: Astrologer

  createdAt: DateTime!
  updatedAt: DateTime!
}
type Payment {
  id: ID!

  amount: Float
  coins: Int

  provider: String
  status: String

  razorpayPaymentId: String

  createdAt: DateTime
}
 type AstrologerWalletTransaction {
  id: ID!

  astrologerWalletId: ID

  sessionId: ID
  paymentId: ID

  type: String!
  coins: Int!
  amount: Float
  description: String
  updatedBalance: Float

  astrologerWallet: AstrologerWallet

  session: Session
  payment: Payment

  createdAt: DateTime!
}

  type AstrologerWalletTransactionList {
    data: [AstrologerWalletTransaction!]!
    totalCount: Int!
      totalPages: Int
  }
    
  #------------------End of astrologer wallet-----------------#
  #------START FOR ALL WALLET TRANSACTIONS-----------------#

  enum WalletSource {
    USER
    ASTROLOGER
  }
type WalletTransaction {
  id: ID!

  userWalletId: ID
  astrologerWalletId: ID

  rechargePack: RechargePack
  rechargePackId: ID

  sessionId: ID
  paymentId: ID

  updatedBalance: Float

  type: String!
  coins: Int!
  amount: Float
  description: String

  userWallet: UserWallet
  astrologerWallet: AstrologerWallet

  source: WalletSource

  createdAt: DateTime!
}
  #---END FOR ALL WALLET TRANSACTIONS-----------------#
  #-----------------------------START of astrologer earnings-----------------#
  input AstrologerEarningSearchInput {
    query: String
    email: String
    contactNo: String

    filterType: String

    startDate: String
    endDate: String

    page: Int
    limit: Int
  }

  type AstrologerEarning {
    astrologerId: ID!
    astrologerName: String!
    email: String
    contactNo: String

    balanceCoins: Float
    totalEarned: Float
    totalWithdrawn: Float
updatedBalance: Float
    totalSessionEarnings: Float
    monthlyEarnings: Float
    todayEarnings: Float

    createdAt: DateTime
  }

  type AstrologerEarningList {
    data: [AstrologerEarning!]!
    totalCount: Int!
    currentPage: Int!
    totalPages: Int!
  }
  #------end of astrologer earnings-----------------#
  # -------------------- TYPES --------------------

  enum SessionFilterType {
    TODAY
    WEEK
    MONTH
    YEAR
    CUSTOM
  }

  input UserChatHistorySearchInput {
    query: String
    mobile: String
    astrologerName: String

    userId: ID

    type: String
    status: String

    filterType: SessionFilterType

    startDate: String
    endDate: String

    page: Int
    limit: Int
  }

  type UserChatHistory {
    sessionId: ID!

    userId: ID!
    userName: String
    mobile: String

    astrologerId: ID!
    astrologerName: String
    source: String
    type: String
    status: String
    by: String
    ratePerMin: Float
    durationSec: Int
 hasRemedy: Boolean!
    coinsDeducted: Float
    coinsEarned: Float
    commission: Float

    startedAt: DateTime
    endedAt: DateTime
    createdAt: DateTime
  }

  type UserChatHistoryList {
    data: [UserChatHistory!]!

    totalCount: Int!
    currentPage: Int!
    totalPages: Int!

    totalCoinsDeducted: Float
    totalCoinsEarned: Float
    totalCommission: Float
  }
  #-------start of user chat history ---------#

  # ------------start for call-history--------

  input UserCallHistorySearchInput {
    query: String
    mobile: String
    astrologerName: String
    type: String
    status: String
    userId: ID
    filterType: SessionFilterType

    startDate: String
    endDate: String

    page: Int
    limit: Int
  }
  type CallRecording {
    id: ID!

    roomId: String!
    sessionId: String

    userId: ID!
    astrologerId: ID!
    astrologerName: String

    fileName: String!
    fileUrl: String!
    filePath: String
    fileSize: Int

    duration: Int
    callType: String
    timestamp: String

    status: String
    isAdminOnly: Boolean

    uploadedBy: String
    uploadedAt: DateTime

    metadata: JSON

    createdAt: DateTime
    updatedAt: DateTime
  }
  type UserCallHistory {
    sessionId: ID!
    source: String
    userId: ID!
    userName: String
    mobile: String
    by: String
    astrologerId: ID!
    astrologerName: String

    type: String
    status: String

    ratePerMin: Float
    durationSec: Int

    coinsDeducted: Float
    coinsEarned: Float
    commission: Float

    startedAt: DateTime
    endedAt: DateTime
    createdAt: DateTime
  }

  type UserCallHistoryList {
    data: [UserCallHistory!]!

    totalCount: Int!
    currentPage: Int!
    totalPages: Int!

    totalCoinsDeducted: Float
    totalCoinsEarned: Float
    totalCommission: Float
  }
  #-------start of user call history ---------#
  #-----END of user call history-------------#
  #-----start of user reviews ---------#
  input UserReviewSearchInput {
    query: String
    userName: String
    astrologerName: String
    rating: Int
    userId: ID
    filterType: SessionFilterType

    startDate: String
    endDate: String

    page: Int
    limit: Int
  }

  input UpdateAstrologerInput {
    astroname: String
    displayName: String
  applicationId: String
    profilePic: String

    gender: Gender
    dateOfBirth: String

    email: String
    phoneNumber: String

    experience: Int

    expertise: [String!]
    languages: [String!]
    problems: [String!]

    about: String

    status: Boolean

    tags: String
    vtags: String

    address: AddressInput
    bankDetails: BankDetailsInput
    documents: DocumentsInput

    pricing: [PricingInput!]
  }

  input UpdateUserInput {
    name: String
    mobile: String
    gender: Gender
    birthDate: DateTime
    birthTime: String
    occupation: String
    isActive: Boolean
  }
  type UserReview {
    reviewId: ID!

    sessionId: ID

    userId: ID
    userName: String
    mobile: String

    astrologerId: ID
    astrologerName: String
    displayName: String

    sessionType: String
    sessionStatus: String
    isFlagged: Boolean
    rating: Int

    comment: String

    createdAt: DateTime
  }

  type UserReviewList {
    data: [UserReview!]!

    totalCount: Int!
    currentPage: Int!
    totalPages: Int!

    averageRating: Float
  }
  #-------END of user reviews ---------#
  #------------START FRAUD FLAGGING ---------------#
  type FraudFlag {
    id: ID!
    keyword: String!
    createdBy: String
    createdAt: DateTime
    updatedAt: DateTime
  }

  input FraudFlagSearchInput {
    query: String
    page: Int
    limit: Int
  }
enum SessionType {
  CHAT
  CALL
}
  type FraudFlagList {
    data: [FraudFlag!]!

    totalCount: Int!
    currentPage: Int!
    totalPages: Int!
  }
  #-----END FRAUD FLAGGING ---------------#
  #----------start faud LOGGING ---------------#
  enum FraudStatus {
    PENDING
    FRAUD
    FINE
  }
  type FraudLog {
    id: ID!

    orderId: String

    sessionId: String

    senderId: String
    senderName: String

    receiverId: String
    receiverName: String

    message: String

    matchedKeywords: [String]

    status: FraudStatus

    createdAt: DateTime
    updatedAt: DateTime
  }

  input FraudLogSearchInput {
    query: String
    status: FraudStatus

    filterType: SessionFilterType

    startDate: String
    endDate: String

    page: Int
    limit: Int
  }

  type FraudLogList {
    data: [FraudLog!]!

    totalCount: Int!
    currentPage: Int!
    totalPages: Int!
  }
  #------end fraud LOGGING ---------------#
  #-----start of payment reports-------------#
  enum PaymentOrderStatus {
    CREATED
    PAID
    FAILED
  }
enum PaymentStatus {
    SUCCESS
    FAILED
    PENDING
}
  input PaymentReportSearchInput{
    query:String

    status:PaymentStatus
    platform:String
    country:String

    filterType:SessionFilterType

    startDate:String
    endDate:String

    minAmount:Float
    maxAmount:Float

    page:Int
    limit:Int
}
type PaymentReport {
  id: ID!

  userId: ID!
  userName: String
  mobile: String

  rechargePackId: ID
  rechargePackName: String

  invoiceNo: String

  amount: Float
  coins: Int

  taxableAmount: Float

  gstRate: Float
  cgst: Float
  sgst: Float
  igst: Float

  totalTax: Float
  totalAmount: Float
 pgChargeRate: Float
  pgCharge: Float
  pgIgst: Float
  pgTotal: Float
  receivableAmount: Float
  country: String
  state: String
  city: String

  platform: String


  razorpayOrderId: String
  razorpayPaymentId: String

  status: PaymentStatus

  createdAt: DateTime
}

 type PaymentReportList {

  data: [PaymentReport!]!

  totalCount: Int!
  currentPage: Int!
  totalPages: Int!

  totalAmount: Float!
  totalCoins: Int!

  paidAmount: Float!
  failedAmount: Float!

  paidCount: Int!
  failedCount: Int!

  totalTax: Float!
  totalGST: Float!
totalPGCharge:Float!
  totalCGST: Float!
  totalSGST: Float!
}

  #------About pagge ___________________#
  enum CmsStatus {
    DRAFT
    PUBLISHED
  }

  type AboutPage {
    id: ID

    pageType: String

    heroTitle: String
    heroDescription: String

    mentors: JSON
    founders: JSON

    metaTitle: String
    metaDescription: String

    keywords: [String]

    status: CmsStatus

    createdAt: String
    updatedAt: String
  }

  input UpdateAboutPageInput {
    heroTitle: String

    heroDescription: String

    mentors: JSON

    founders: JSON

    metaTitle: String

    metaDescription: String

    keywords: [String]

    status: CmsStatus
  }

  type PrivacyPage {
    id: ID

    pageType: String

    title: String

    content: String

    metaTitle: String

    metaDescription: String

    keywords: [String]

    status: CmsStatus

    createdAt: String
    updatedAt: String
  }

  input UpdatePrivacyPageInput {
    title: String

    content: String

    metaTitle: String

    metaDescription: String

    keywords: [String]

    status: CmsStatus
  }
  type RefundPolicyPage {
    id: ID

    pageType: String

    title: String

    content: String

    metaTitle: String

    metaDescription: String

    keywords: [String]

    status: CmsStatus

    createdAt: String
    updatedAt: String
  }

  input UpdateRefundPolicyPageInput {
    title: String

    content: String

    metaTitle: String

    metaDescription: String

    keywords: [String]

    status: CmsStatus
  }
  type DisclaimerPage {
    id: ID

    pageType: String

    title: String

    content: String

    metaTitle: String

    metaDescription: String

    keywords: [String]

    status: CmsStatus

    createdAt: String
    updatedAt: String
  }

  input UpdateDisclaimerPageInput {
    title: String

    content: String

    metaTitle: String

    metaDescription: String

    keywords: [String]

    status: CmsStatus
  }

  #-----END OF PAYMENT REPORTS-----------------#
  #---------------------START code for remedy---#

  type Remedy {
    id: ID!
    title: String!
    description: String
    isActive: Boolean
    createdAt: String
    updatedAt: String
  }

  input CreateRemedyInput {
    title: String!
    description: String
  }

  input UpdateRemedyInput {
    title: String
    description: String
    isActive: Boolean
  }

  #----------------------app----------------#
  enum PlatformType {
    ANDROID
    IOS
  }
  enum AppType {
    USER
    ASTROLOGER
  }

  type AppVersion {
    appType: AppType!
    id: ID!

    platform: PlatformType!

    latestVersion: String!
    minimumVersion: String!

    forceUpdate: Boolean!

    maintenanceMode: Boolean!
    maintenanceMessage: String

    playStoreUrl: String
    appStoreUrl: String

    releaseNotes: String

    createdAt: String
    updatedAt: String
  }

  input AddAppVersionInput {
    appType: AppType!
    platform: PlatformType!

    latestVersion: String!
    minimumVersion: String!

    forceUpdate: Boolean

    maintenanceMode: Boolean
    maintenanceMessage: String

    playStoreUrl: String
    appStoreUrl: String

    releaseNotes: String
  }

  type AppVersionResponse {
    success: Boolean!
    message: String!
    data: AppVersion
  }

  type FreeService {
    id: ID!
    title: String!
    icon: String!
    href: String!
    slug: String!
    isActive: Boolean!
    order: Int!
  }

  #------------END CODE For remedy-----------------#

  #-----start code for offer price-----------------#
  # ================= OFFER =================

  type Offer {
    id: ID!

    offerName: String!

    price: Float!

    description: String

    isActive: Boolean!

    createdAt: String!

    updatedAt: String!
  }

  input CreateOfferInput {
    offerName: String!

    price: Float!

    description: String
  }

  type OfferResponse {
    success: Boolean!

    message: String!

    data: Offer
  }
  input UpdateOfferInput {
    offerName: String
    price: Float
    description: String
    isActive: Boolean
  }
  #--------END code for offer price-----------#
  #-------------------START OF GET ASTROLOGER BY ID-----------------#
  type Astrologer {
    id: ID!

    name: String
    displayName: String!

    profilePic: String

    dateOfBirth: DateTime

    gender: Gender!

    email: String!
    contactNo: String!

    experience: Int!

    about: String

    languages: [String!]!
    skills: [String!]!
    problems: [String!]!
isEligibleChat: Boolean!
isEligibleCall: Boolean!
isEligibleVideo: Boolean!
isEligibleAudio: Boolean!
    pricing: [AstrologerPricing!]!

    tags: String
    vtags: String

    kycDetail: KycDetail

    approvalStatus: ApprovalStatus!

    addresses: [Address!]!
    experiences: [ExperiencePlatform!]!
    interviews: [Interview!]!

    createdAt: DateTime
    updatedAt: DateTime
  }
  #----END OF GET ASTROLOGER BY ID-----------------#
  #-------------START code for send gift history----

  type GiftHistory {
    id: ID!

    giftId: ID
    giftName: String!
    giftPrice: Float!

    userId: ID!
    astrologerId: ID!

    user: User
    astrologer: Astrologer
    gift: Gift
    createdAt: DateTime!
  }
  type GiftHistoryResponse {
    data: [GiftHistory!]!
    totalCount: Int!
    currentPage: Int!
    totalPages: Int!
  }
  enum NoticeTargetType {
    ALL
    SELECTED
  }
  type Notice {
    id: ID!
    title: String!
    description: String!

    targetType: NoticeTargetType!

    astrologers: [Astrologer]

    isPinned: Boolean!
    isActive: Boolean

    startDate: String
    endDate: String

    createdAt: String
  }
  input CreateNoticeInput {
    title: String!

    description: String!

    targetType: NoticeTargetType!

    astrologers: [ID]

    isActive: Boolean

    startDate: String

    endDate: String
  }
  input UpdateNoticeInput {
    title: String
    description: String

    targetType: NoticeTargetType

    astrologers: [ID]

    isActive: Boolean

    startDate: String
    endDate: String
  }
  type Blog {
    id: ID!

    title: String!
    slug: String!

    language: String!

    shortDescription: String!
    content: String!

    featuredImage: String

    publishDate: String

    status: String!

    hashtags: [String!]

    metaTitle: String
    metaDescription: String
    metaKeywords: String

    schemaMarkup: String

    categories: [BlogCategory!]

    createdAt: String
    updatedAt: String
  }
  type BlogCategory {
    id: ID!
    name: String!
    slug: String!
    createdAt: String
  }
  input CreateBlogInput {
    title: String!
    slug: String!

    language: String!

    shortDescription: String!
    content: String!

    featuredImage: String

    publishDate: String

    status: String!

    hashtags: [String!]

    metaTitle: String
    metaDescription: String
    metaKeywords: String

    schemaMarkup: String

    categoryIds: [String!]!
  }
  input CreateBlogCategoryInput {
    name: String!
    slug: String!
  }
  type SessionStatusSummary {
    requested: Int!
    accepted: Int!
    ongoing: Int!
    completed: Int!
    cancelled: Int!
    failed: Int!
  }
type Session {
  id: ID!
  type: String
  status: String

  ratePerMin: Int
  durationSec: Int

  coinsDeducted: Float
  coinsEarned: Float
  commission: Float

  source: String
  roomId: String

  startedAt: DateTime
  endedAt: DateTime
  createdAt: DateTime
}
  type AstrologerDashboardStats {
    totalChats: Int!
    statusSummary: SessionStatusSummary!
    totalCalls: Int!

    totalSessions: Int!

    totalCoinsEarned: Float!

    totalCoinsDeducted: Float!

    totalCommission: Float!

    totalDurationMinutes: Int!

    walletBalance: Float!

    totalEarned: Float!

    totalWithdrawn: Float!

    totalFollowers: Int!

    totalReviews: Int!

    averageRating: Float!
  }
  enum SessionStatus {
    REQUESTED
    ACCEPTED
    ONGOING
    COMPLETED
    CANCELLED
    FAILED
  }

  type AstrologerSessionHistory {
    sessionId: ID!
    userId: ID!
roomId: String
    userName: String
    by: String
    ratePerMin: Int
    durationSec: Int
    type: SessionType
   astrologerCommission: Float
  dhwaniCommission: Float
hasRemedy: Boolean!
  coinsDeducted: Float
astrologerId: String
    status: SessionStatus

    startedAt: String
    endedAt: String

    createdAt: String
  }

  type AstrologerSessionHistoryList {
    data: [AstrologerSessionHistory!]!

    totalCount: Int!
    currentPage: Int!
    totalPages: Int!
  }
  type ToggleReviewResponse {
    success: Boolean!
    message: String!
  }

  type Message {
    id: ID
    msgId: String
    roomId: String
    senderId: String
    receiverId: String
    time: String
    message: String
    image: String
    sender: String
    replyTo: String
    createdAt: String
  }

  type SessionMessagesResponse {
    success: Boolean!
    totalCount: Int!
    data: [Message!]!
  }

  type DashboardCounts {
    totalAstrologers: Int!
    totalUsers: Int!
    totalStaff: Int!
  totalRechargeAmount: Float
    totalCalls: Int!
    totalChats: Int!

    totalRevenue: Float!

    totalApplications: Int!
  }
  type AstrologerReview {
    reviewId: ID!
    sessionId: ID

    userId: ID!
    userName: String!

    rating: Float!
    comment: String

    sessionType: String

    createdAt: String!
  }
  type AstrologerGiftHistoryResponse {
    data: [AstrologerGift!]!
    totalCount: Int!
  }
  type AstrologerGift {
    id: ID!
    coins: Int
    amount: Float
    description: String
    createdAt: String
    userName: String
    userId: ID
    sessionId: ID
  }
  type AstrologerFollowerResponse {
    data: [AstrologerFollower!]!
    totalCount: Int!
    currentPage: Int!
    totalPages: Int!
  }

  type AstrologerFollower {
    id: ID!
    createdAt: DateTime!

    user: User!
  }
  enum DashboardFilter {
    TODAY
    WEEK
    MONTH
  }
  type SessionAnalytics {
    totalSessions: Int!
    totalChats: Int!
    totalCalls: Int!

    statusSummary: SessionStatusSummary!

    recentSessions: [AstrologerSessionHistory!]!
  }
  type SessionRemedy {
    id: ID!
    sessionId: String!
    remedyText: String!
    createdAt: String!
  }

type WaitingQueueUser {
  userId: ID!
  name: String
  mobile: String
  countryCode: String
  
  roomId: String!
  maximumTime: Int
  source: String
  type: String
}

type AstrologerQueue {
  astrologerId: ID!
  astrologerName: String!
  astrologerProfilePic: String
  isOnline: Boolean
  isBusy: Boolean

  waitingCount: Int!

  waitingUsers: [WaitingQueueUser!]!
}
  type Skill {
  id: ID!

  name: String!

  slug: String!

  sortOrder: Int!

  isActive: Boolean!

  createdAt: String
  updatedAt: String
}

input CreateSkillInput {
  name: String!
  slug: String
  sortOrder: Int
  isActive: Boolean
}

input UpdateSkillInput {
  name: String
  slug: String
  sortOrder: Int
  isActive: Boolean
}
  type Problem {
  id: ID!

  name: String!

  slug: String!

  sortOrder: Int!

  isActive: Boolean!

  createdAt: String
  updatedAt: String
}

input CreateProblemInput {
  name: String!
  slug: String
  sortOrder: Int
  isActive: Boolean
}

input UpdateProblemInput {
  name: String
  slug: String
  sortOrder: Int
  isActive: Boolean
}
  #-----End code for send gift history-----------------#
  #-------------START CODE FOR ASTROLOGER PAYOUT--------
type PayoutReport {
  astrologerId: String!
  astrologerName: String!
  profilePic: String

  accountHolderName: String
  accountNumber: String
  bankName: String
  ifsc: String
  panNumber: String
  state: String

  totalSessions: Int!

  totalRevenue: Float!

  commissionPercent: Float!
  commission: Float!

  earning: Float!

  pgChargeRate: Float!
  pgCharge: Float!

  gstRate: Float!
  cgst: Float!
  sgst: Float!
  igst: Float!

  pgTotal: Float!

  grossAmount: Float!

  tdsPercent: Float!
  tdsAmount: Float!
totalPaid: Float
  lastPaidAmount: Float!

  payableAmount: Float!
}

type AstrologerPayoutHistory {
  id: ID!
  astrologerId: ID!
  astrologerName: String
  remark: String
  earning: Float
  pgCharge: Float
  subTotal: Float
  tdsAmount: Float
  paidAmount: Float
  startDate: String
  endDate: String
  paidOn: String
}
input RefundRequestSearchInput {
  page: Int
  limit: Int

  status: RefundRequestStatus

  search: String
}
input CreateRefundRequestInput {
  sessionId: ID!
  refundDuration: Int!
  refundReason: String!
  refundType: String
  mode: String
}
  enum RefundRequestStatus {
  PENDING
  APPROVED
  REJECTED
}
  type RefundRequest {
  id: ID!

  sessionId: ID!

  userId: ID!
  userName: String
  userMobile: String

  astrologerId: ID!
  astrologerName: String

  transactionId: String
  orderId: String

  sessionDuration: Int!
  ratePerMin: Int!
sessionDate: DateTime!
  refundDuration: Int!
  refundAmount: Float!

  refundType: String
  mode: String
  refundReason: String!

  requestedByStaffId: ID!
  requestedByStaffName: String!

  status: RefundRequestStatus!

  approvedByStaffId: ID
  approvedByStaffName: String
  approvedAt: DateTime

  rejectedByStaffId: ID
  rejectedByStaffName: String
  rejectedAt: DateTime

  rejectionReason: String

  createdAt: DateTime!
  updatedAt: DateTime!
}
  type RefundRequestList {
  data: [RefundRequest!]!

  totalCount: Int!
  currentPage: Int!
  totalPages: Int!
}

  #-------------END CODE FOR ASTROLOGER PAYOUT--------

  type Query {
     getRefundRequests(
    searchInput: RefundRequestSearchInput
  ): RefundRequestList!
  getAstrologerPayoutHistory(astrologerId: ID!): [AstrologerPayoutHistory]
    getSkills: [Skill!]!

  getSkill(id: ID!): Skill

  getProblems: [Problem!]!

  getProblem(id: ID!): Problem
  getAstrologerWaitingUsers(
    astrologerId: ID!
  ): AstrologerQueue!

  
  getAllWaitingQueues: [AstrologerQueue!]!
    getCallRecording(sessionId: ID!): CallRecording
    getSessionRemedies(sessionId: String!): [SessionRemedy!]!
    getAstrologerGiftHistory(
      astrologerId: ID!
      page: Int
      limit: Int
    ): AstrologerGiftHistoryResponse!
    freeServices: [FreeService!]!
    getAppVersions: [AppVersion!]!
    getLatestAppVersion(platform: PlatformType!): AppVersion
    #cmss page #
    getAboutPage: AboutPage
    getPrivacyPage: PrivacyPage
    getRefundPolicyPage: RefundPolicyPage
    getDisclaimerPage: DisclaimerPage

    #pricing config #
    getOfferAnalytics: OfferAnalytics

    getPricingConfig: PricingConfig
    getAdminPreviewPrice: FinalPrice
    getFinalPrice(astrologerId: String!): FinalPrice

    #astrologer registration #
    getApplicationById(id: String!): AstrologerApplication

    getMyInterviews: [AstrologerApplication]
    getApplication(id: ID!): AstrologerApplication
    getApplications: [AstrologerApplication!]!

    getPendingApplications: [AstrologerApplication]
    getInterviewers: [Staff]

    getBanners: [Banner!]!

    faqs: [Faq!]!
    faq(id: ID!): Faq

    testimonials: [Testimonial!]!
    testimonial(id: ID!): Testimonial

    getGifts: [Gift]

    getCategories: [Category!]!

    getCategory(id: ID!): Category

    getServices: [Service!]!

    getService(id: ID!): Service

    getServiceBySlug(slug: String!): Service

    getCoupons: [Coupon]
    getSections: [String!]!
    getModulesPaginated(page: Int, limit: Int): ModulePagination!
    getModulesBySection(section: String!): [Module!]!
    getMyAccess: [ModuleAccess!]!
    getUsersListBySearch(searchInput: UserSearchInput!): UserList!
    getUserProfile(userId: ID!): User
    getPendingAstrologers(page: Int, limit: Int): PaginatedAstrologers!

    getAstrologerInterviews(
      astrologerId: String!
      page: Int
      limit: Int
    ): PaginatedInterviews!

    getAstrologerListBySearch(
      searchInput: AstrologerSearchInput!
    ): AstrologerList!

    getRegisteredAstrologers(page: Int, limit: Int): [Astrologer!]!
    getApprovedAstrologers(page: Int, limit: Int): PaginatedAstrologers!

    getAdmins(page: Int = 1, limit: Int = 10): AdminPagination!

    getRoles(page: Int = 1, limit: Int = 10): RolePagination!

    getPermissions(page: Int = 1, limit: Int = 10): PermissionPagination!

    getDepartments(page: Int = 1, limit: Int = 10): DepartmentPagination!

    getStaff(page: Int = 1, limit: Int = 10): StaffPagination!

    getRechargePacks: [RechargePack!]!

    getUserWallet(userId: ID!): UserWallet

    getUserWalletTransactions(
      page: Int
      limit: Int
      type: String
      amount: Float
      mobile: String
      userId: ID
      onlyRecharge: Boolean
      filterType: String
      startDate: String
      endDate: String
    ): WalletTransactionList!

    getAstrologerWalletTransactions(
      page: Int
      limit: Int
      type: String
      contactNo: String
      amount: Float
       astrologerId: ID
      filterType: String
      startDate: String
      endDate: String
    ): AstrologerWalletTransactionList!
    getAllWalletTransactions(
      page: Int
      limit: Int
      type: String
      amount: Float
      contactNo: String
      filterType: String
      startDate: String
      endDate: String
      source: String
    ): WalletTransactionList!

    getAstrologerEarnings(
      searchInput: AstrologerEarningSearchInput!
    ): AstrologerEarningList!

    getUsersChatHistory(
      searchInput: UserChatHistorySearchInput!
    ): UserChatHistoryList!

    getUserCallHistory(
      searchInput: UserCallHistorySearchInput!
    ): UserCallHistoryList!

    getUserReviews(searchInput: UserReviewSearchInput!): UserReviewList!
    getFraudFlags(searchInput: FraudFlagSearchInput): FraudFlagList!

    getFraudLogs(searchInput: FraudLogSearchInput): FraudLogList!

    getPaymentReports(
      searchInput: PaymentReportSearchInput!
    ): PaymentReportList!

    getRemedies: [Remedy]

    getRemedyById(id: ID!): Remedy

    getOffers: [Offer!]!

    getAstrologerById(id: ID!): Astrologer

    getSendGiftHistory(
      page: Int
      limit: Int
      search: String
      astrologerId: String
      fromDate: String
      toDate: String
    ): GiftHistoryResponse!

    getAstrologerNotices: [Notice]

    blogs: [Blog!]!

    blog(id: ID!): Blog
    blogBySlug(slug: String!): Blog

    blogCategories: [BlogCategory!]!

    blogCategory(id: ID!): BlogCategory

    getAstrologerDashboardStats(astrologerId: ID!): AstrologerDashboardStats!
    getAstrologerChatHistory(
      astrologerId: ID!

      page: Int

      limit: Int

      status: SessionStatus

      filter: DashboardFilter
    ): AstrologerSessionHistoryList!

    getAstrologerCallHistory(
      astrologerId: ID!
      page: Int
      limit: Int
      status: SessionStatus
      filter: DashboardFilter
    ): AstrologerSessionHistoryList!
    getSessionAnalytics(
      status: SessionStatus
      filter: DashboardFilter
    ): SessionAnalytics!

    adminGetSessionMessages(sessionId: String!): SessionMessagesResponse!
    getDashboardCounts: DashboardCounts!
    updateNotice(id: ID!, input: UpdateNoticeInput!): Notice!
    deleteNotice(id: ID!): Boolean!
    getNotices: [Notice!]!
    getServiceAstrologers(serviceId: ID!): [ServiceAstrologer!]!
    getAstrologerReviews(astrologerId: ID!): [AstrologerReview!]!
    getAstrologerFollowers(
      astrologerId: ID!
      page: Int
      limit: Int
      search: String
    ): AstrologerFollowerResponse!
    exportAstrologers(query: String): [Astrologer]
    payoutReport(fromDate: String!, toDate: String!): [PayoutReport!]!
  }

  type Mutation {
    upsertAboutPage(input: UpdateAboutPageInput!): AboutPage
    upsertPrivacyPage(input: UpdatePrivacyPageInput!): PrivacyPage
    upsertRefundPolicyPage(
      input: UpdateRefundPolicyPageInput!
    ): RefundPolicyPage
    upsertDisclaimerPage(input: UpdateDisclaimerPageInput!): DisclaimerPage
    uploadImage(file: Upload!): UploadResponse
    deleteAppVersion(id: ID!): Boolean!
    createBanner(input: CreateBannerInput!): Banner!
    updateBanner(id: ID!, input: UpdateBannerInput!): Banner!
    deleteBanner(id: ID!): Boolean!

    createFaq(input: CreateFaqInput!): Faq!
    updateFaq(id: ID!, input: UpdateFaqInput!): Faq!
    deleteFaq(id: ID!): String!

    createTestimonial(input: CreateTestimonialInput!): Testimonial!
    updateTestimonial(id: ID!, input: UpdateTestimonialInput!): Testimonial!
    deleteTestimonial(id: ID!): String!

    createGift(input: GiftInput!): Gift
    deleteGift(id: ID!): Boolean
    updateGift(id: ID!, input: GiftInput!): Gift

    createCategory(input: CreateCategoryInput!): Category!

    updateCategory(id: ID!, input: CreateCategoryInput!): Category!

    deleteCategory(id: ID!): Boolean!

    createService(input: CreateServiceInput!): Service!

    updateService(id: ID!, input: CreateServiceInput!): Service!

    deleteService(id: ID!): Boolean!

    addAstrologer(data: AddAstrologerInput!): AddAstrologerResponse!
    loginStaff(email: String!, password: String!): AuthPayload!
    logoutAdmin: String!
    updateUser(userId: String!, data: UpdateUserInput!): User!
    deleteUser(userId: String!): Boolean!

    createPermission(
      name: String!
      moduleIds: [ID!]!
      type: String!
    ): Permission!

    updatePermission(
      permissionId: ID!
      name: String
      moduleIds: [ID!]
    ): Permission!

    deletePermission(permissionId: ID!): Boolean!

    createRole(
      name: String!
      slug: String!
      description: String
      permissionIds: [ID!]
    ): Role!

    updateRole(
      roleId: String!
      name: String
      slug: String
      description: String
      isActive: Boolean
    ): Role

    deleteRole(roleId: ID!): DeleteResponse!

    assignPermissionsToRole(roleId: ID!, permissionIds: [ID!]!): Role!

    createAdmin(
      name: String!
      email: String!
      phoneNo: String!
      password: String!
      roleId: ID!
    ): Admin!

    updateAdmin(
      adminId: String!
      name: String
      email: String
      roleId: String
    ): Admin

    deleteAdmin(adminId: String!): Boolean!

    updateAstrologer(
      astrologerId: ID!
      data: UpdateAstrologerInput!
    ): Astrologer!

    deleteAstrologer(astrologerId: ID!): Boolean!

    rejectAstrologer(
      astrologerId: ID!
      stage: String!
      reason: String!
    ): Boolean

    createRechargePack(input: RechargePackInput!): RechargePack!
    updateRechargePack(id: ID!, input: UpdateRechargePackInput!): RechargePack!
    deleteRechargePack(id: ID!): String!

    createCoupon(input: CreateCouponInput!): Coupon
    deleteCoupon(id: ID!): Boolean
    updateCouponStatus(id: ID!, status: String!): Coupon

    createModule(
      name: String!
      slug: String!
      description: String
      section: String!
    ): Module!
    updateModule(
      id: ID!
      name: String
      slug: String
      description: String
      section: String
      isActive: Boolean
    ): Module!

    deleteModule(id: ID!): Boolean!

    createDepartment(name: String!, description: String): Department!

    updateDepartment(
      departmentId: ID!
      name: String
      description: String
      isActive: Boolean
    ): Department!

    deleteDepartment(departmentId: ID!): Boolean!

    createStaff(
      name: String!
      email: String!
      password: String!
      departmentId: ID!
      roleId: ID!
      permissionIds: [ID!]!
    ): Staff!

    updateStaff(
      staffId: ID!
      name: String
      email: String
      departmentId: ID
      roleId: ID
      permissionIds: [ID!]
    ): Staff!

    deleteStaff(staffId: ID!): Boolean!

    scheduleInterview(
      astrologerId: ID!
      astrologerNumber: String!
      astrologerMail: String!
      interviewerId: String!
      interviewDate: String!
      interviewTime: String!
      round: Int!
    ): AstrologerApplication

    updateInterviewStatus(
      astrologerId: ID!
      status: InterviewStatus!
    ): AstrologerApplication

    updateDocumentStatus(
      astrologerId: ID!
      status: DocumentStatus!
    ): AstrologerApplication

    updateApprovalStatus(
      astrologerId: ID!
      status: ApprovalStatus!
    ): AstrologerApplication

    approveAstrologer(id: ID!): Astrologer!

    updateInterviewResult(
      astrologerId: ID!
      status: String!
      remarks: String
    ): AstrologerApplication

    # pricing config mutation #
    updatePricingConfig(
      isGlobalOfferEnabled: Boolean
      globalChatPrice: Int
      globalCallPrice: Int
      isFirstOfferEnabled: Boolean
      firstChatPrice: Int
      firstCallPrice: Int

      isSecondOfferEnabled: Boolean
      secondChatPrice: Int
      secondCallPrice: Int
    ): PricingConfig

    markOfferUsed(userId: String!): Boolean

    #---- Save bank details & docs -----#
    saveAndVerifyKyc(
      astrologerId: String!
      input: KycDetailInput!
      remarks: String
    ): KycDetail

    rejectKyc(astrologerId: String!, remarks: String): Boolean
    createFraudFlag(keyword: String!): FraudFlag!

    deleteFraudFlag(id: ID!): Boolean!

    updateFraudLogStatus(id: ID!, status: FraudStatus!): FraudLog!

    createRemedy(input: CreateRemedyInput!): Remedy
    updateRemedy(id: ID!, input: UpdateRemedyInput!): Remedy
    deleteRemedy(id: ID!): Boolean

    addOrUpdateAppVersion(data: AddAppVersionInput!): AppVersionResponse

    createFreeService(
      title: String!
      icon: String!
      href: String!
      slug: String!
      order: Int
    ): FreeService!

    deleteFreeService(id: ID!): Boolean!

    createOffer(data: CreateOfferInput!): OfferResponse!

    updateOffer(id: String!, data: UpdateOfferInput!): OfferResponse!

    deleteOffer(id: String!): MessageResponse!

    createNotice(input: CreateNoticeInput!): Notice

    updateNotice(id: ID!, input: CreateNoticeInput!): Notice

    deleteNotice(id: ID!): Boolean

    markNoticeRead(noticeId: ID!): Boolean
    createBlog(input: CreateBlogInput!): Blog!

    updateBlog(id: ID!, input: CreateBlogInput!): Blog!

    deleteBlog(id: ID!): Boolean!

    createBlogCategory(input: CreateBlogCategoryInput!): BlogCategory!

    updateBlogCategory(id: ID!, input: CreateBlogCategoryInput!): BlogCategory!

    deleteBlogCategory(id: ID!): Boolean!

    updateAstrologerAvailability(
      astrologerId: ID!
      isChatActive: Boolean
      isCallActive: Boolean
      isLiveActive: Boolean
      isPromotional: Boolean
    ): Astrologer!
    toggleReviewFlag(reviewId: ID!, isFlagged: Boolean!): ToggleReviewResponse!
    updateCoupon(id: ID!, input: UpdateCouponInput!): Coupon!

  updateReviewComment(
  reviewId: ID!
  comment: String
  rating: Int
): UserReview!

    updateGiftStatus(id: ID!, status: String!): Gift!
    saveServiceAstrologers(
      serviceId: ID!
      astrologers: [ServiceAstrologerInput!]!
    ): Boolean!
    updateUserStatus(userId: ID!, isActive: Boolean!,isDeleted: Boolean!): User!
    manageAstrologerWallet(
      astrologerId: ID!
      amount: Float!
      remarks: String
      type: TransactionType!
    ): WalletResponse!
    manageUserWallet(
      userId: ID!
      amount: Float!
      remarks: String
      type: TransactionType!
    ): WalletResponse!
    endSessionByAdmin(sessionId: ID!): String!
      createSkill(
    input: CreateSkillInput!
  ): Skill!

  updateSkill(
    id: ID!
    input: UpdateSkillInput!
  ): Skill!

  deleteSkill(
    id: ID!
  ): Boolean!

  updateSkillStatus(
    id: ID!
    status: Boolean!
  ): Skill!




  createProblem(
    input: CreateProblemInput!
  ): Problem!

  updateProblem(
    id: ID!
    input: UpdateProblemInput!
  ): Problem!

  deleteProblem(
    id: ID!
  ): Boolean!

  updateProblemStatus(
    id: ID!
    status: Boolean!
  ): Problem!
   exportPayoutReport(
    fromDate: String!
    toDate: String!
     remark: String
  ): [PayoutReport!]!
   createRefundRequest(
    input: CreateRefundRequestInput!
  ): RefundRequest!

  approveRefundRequest(
    id: ID!
  ): RefundRequest!

  rejectRefundRequest(
    id: ID!
    reason: String!
  ): RefundRequest!
  restoreAstrologer(astrologerId: ID!): Boolean
  }
`;

export default typeDefs;
