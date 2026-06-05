{
  "variables": {
    "lto_jobs%": ""
  },
  "targets": [
    {
      "target_name": "hello",
      "sources": [ "hello.cc" ],
      "include_dirs": [
        "<!(node -e \"require('nan')\")"
      ],
      "conditions": [
        ["OS=='win'", {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "AdditionalOptions!": ["-flto=thin", "-flto=full"]
            },
            "VCLinkerTool": {
              "AdditionalOptions!": [
                "-flto=thin",
                "-flto=full",
                "/opt:lldltojobs=<(lto_jobs)"
              ]
            }
          }
        }]
      ]
    }
  ]
}