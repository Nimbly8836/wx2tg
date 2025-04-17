import "reflect-metadata";
import { container } from "tsyringe";

// 清除所有已注册的实例
container.clearInstances();

// 创建一个简单的工厂函数来获取服务实例
export function getService<T>(serviceClass: new (...args: any[]) => T): T {
    return container.resolve(serviceClass);
}

// 导出容器，以便在需要时使用
export { container }; 