local PLUGIN_NAME = "anomaly-collector"


local schema = {
  name = PLUGIN_NAME,

  fields = {
    {
      config = {
        type = "record",

        fields = {
          {
            response_mode = {
              type = "string",
              required = true,
              default = "log_only",
              one_of = {
                "log_only",
                "block",
              },
            },
          },
        },
      },
    },
  },
}


return schema