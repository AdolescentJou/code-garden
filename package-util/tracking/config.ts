// 埋点需要的配置
const config = {
  Trackingtest: {
    isTracking: false,
    eventList: [
      {
        fnName: 'componentWillMount',
        trackEvent: {
          tag_name: 'home_enter',
          type: 'FAQ',
        },
      },
      {
        fnName: 'bindC',
        extName: 'trackingFormid',
        trackEvent: {
          tag_name: 'home_server_list',
          type: 'FAQ',
        },
      },
      {
        fnName: 'bindC2',
        extName: 'trackingClicke',
      },
    ],
  },
};

export { config };
