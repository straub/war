
define(['backbone'], function (Backbone) {

    var SettingsView = Backbone.View.extend({
        initialize: function () {
            this.setElement($("#settings"));

            this.$("[name=seed]").val(app.randomSeed);

            this.$(".render-mesh").attr("checked", app.drawFlockMesh);
            this.$(".render-vectors").attr("checked", app.drawVectors);
            this.$(".render-ranges").attr("checked", app.drawRanges);
            this.$(".render-ai").attr("checked", app.drawAIIndicators);
        },
        events: {
            "click .render-mesh": "toggleDrawFlockMesh",
            "click .render-vectors": "toggleDrawVectors",
            "click .render-ranges": "toggleDrawRanges",
            "click .render-ai": "toggleDrawAI"
        },

        toggleDrawFlockMesh: function (e) {

            app.drawFlockMesh = !app.drawFlockMesh;

            this.$(".render-mesh").attr("checked", app.drawFlockMesh);
        },
        toggleDrawVectors: function (e) {

            app.drawVectors = !app.drawVectors;

            this.$(".render-vectors").attr("checked", app.drawVectors);
        },
        toggleDrawRanges: function (e) {

            app.drawRanges = !app.drawRanges;

            this.$(".render-ranges").attr("checked", app.drawRanges);
        },
        toggleDrawAI: function (e) {

            app.drawAIIndicators = !app.drawAIIndicators;

            this.$(".render-ai").attr("checked", app.drawAIIndicators);
        }
    });

    return SettingsView;
});
