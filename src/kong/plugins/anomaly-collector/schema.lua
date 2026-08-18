local PLUGIN_NAME = "anomaly-collector"

local schema = {
  name = PLUGIN_NAME,
  fields = {
    {
      config = {
        type = "record",
        fields = {
        },
      },
    },
  },
}

return schema