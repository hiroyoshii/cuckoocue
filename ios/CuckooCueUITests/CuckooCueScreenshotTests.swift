import XCTest

final class CuckooCueScreenshotTests: XCTestCase {
    func testTopLevelNavigationMatchesRunFirstStructure() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing"]
        app.launch()

        XCTAssertEqual(app.tabBars.count, 0)
        XCTAssertTrue(app.navigationBars["Cuckoo Cue"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.images["brand-lockup"].exists)
        XCTAssertTrue(app.links["Webでタスクを探す"].exists)
        XCTAssertTrue(app.buttons["新しいリストを作る"].exists)

        app.buttons["Widget設定"].tap()
        XCTAssertTrue(app.navigationBars["ウィジェット"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.otherElements["widget-settings-preview"].exists)
        app.buttons["完了"].tap()
        XCTAssertTrue(app.navigationBars["Cuckoo Cue"].waitForExistence(timeout: 5))
    }

    func testEmptyRunStatePromotesWebSearchInContent() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "state-empty"]
        app.launch()

        XCTAssertTrue(app.staticTexts["リストを始めましょう"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.links["Webでタスクを探す"].exists)
        XCTAssertTrue(app.buttons["新しいリストを作る"].exists)
    }

    func testOnlyLatestCompletedRunIsFollowedByWebHistory() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "state-completed-run"]
        app.launch()

        XCTAssertTrue(app.staticTexts["最近完了"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["週末の用事"].exists)
        XCTAssertFalse(app.staticTexts["リリース準備"].exists)
        XCTAssertTrue(app.links["完了履歴からもう一度使う"].exists)
    }

    func testCompletedRunCanBeRestoredOrReusedLocally() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "state-completed-run"]
        app.launch()

        app.staticTexts["週末の用事"].tap()
        XCTAssertTrue(app.buttons["植物に水をあげるの完了を取り消す"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["もう一度使う"].exists)
        app.buttons["もう一度使う"].tap()
        XCTAssertTrue(app.buttons["植物に水をあげるを完了"].waitForExistence(timeout: 5))
    }

    func testWidgetScreenshotHarnessIsAccessibleAtAllSizes() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "--screenshot-gallery"]
        app.launch()

        let preview = app.otherElements["widget-preview"]
        XCTAssertTrue(preview.waitForExistence(timeout: 5))

        for label in ["Small", "Medium", "Large", "Lock"] {
            app.buttons[label].tap()
            let attachment = XCTAttachment(screenshot: app.screenshot())
            attachment.name = "CuckooCue-Widget-\(label)"
            attachment.lifetime = .keepAlways
            add(attachment)
        }
    }
}
